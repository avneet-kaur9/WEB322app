const Sequelize = require('sequelize');

var sequelize = new Sequelize('rfpwttrx', 'rfpwttrx', 'BL0jR9AhNK73as74De5Ab2sbjjJv3tnv', {
  host: 'suleiman.db.elephantsql.com',
  dialect: 'postgres',
  port: 5432,
  dialectOptions: {
      ssl: { rejectUnauthorized: false }
  },
  query: { raw: true },
  pool: {
      max: 10,
      min: 0,
      idle: 10000
  }
});

'use strict';

var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var runSequence = require('run-sequence');
var stream = require('stream');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var streamqueue = require('streamqueue');
var zip = require('gulp-zip');

var BUILD_DIR = 'build/';
var JSDOC_DIR = 'jsdoc/';
var L10N_DIR = 'l10n/';
var TEST_DIR = 'test/';

var makeFile = require('./make.js');
var stripCommentHeaders = makeFile.stripCommentHeaders;
var builder = makeFile.builder;

var CONFIG_FILE = 'pdfjs.config';
var config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

var DEFINES = {
  PRODUCTION: true,
  // The main build targets:
  GENERIC: false,
  FIREFOX: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  SINGLE_FILE: false,
  COMPONENTS: false
};

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(new gutil.File({
      cwd: '',
      base: '',
      path: filename,
      contents: new Buffer(content)
    }));
    this.push(null);
  };
  return source;
}

function stripUMDHeaders(content) {
  var reg = new RegExp(
    'if \\(typeof define === \'function\' && define.amd\\) \\{[^}]*' +
    '\\} else if \\(typeof exports !== \'undefined\'\\) \\{[^}]*' +
    '\\} else ', 'g');
  return content.replace(reg, '');
}

function checkChromePreferencesFile(chromePrefsPath, webPrefsPath) {
  var chromePrefs = JSON.parse(fs.readFileSync(chromePrefsPath).toString());
  var chromePrefsKeys = Object.keys(chromePrefs.properties);
  chromePrefsKeys.sort();
  var webPrefs = JSON.parse(fs.readFileSync(webPrefsPath).toString());
  var webPrefsKeys = Object.keys(webPrefs);
  webPrefsKeys.sort();
  var telemetryIndex = chromePrefsKeys.indexOf('disableTelemetry');
  if (telemetryIndex >= 0) {
    chromePrefsKeys.splice(telemetryIndex, 1);
  } else {
    console.log('Warning: disableTelemetry key not found in chrome prefs!');
    return false;
  }
  if (webPrefsKeys.length !== chromePrefsKeys.length) {
    return false;
  }
  return webPrefsKeys.every(function (value, index) {
    return chromePrefsKeys[index] === value &&
           chromePrefs.properties[value].default === webPrefs[value];
  });
}

function bundle(filename, outfilename, pathPrefix, initFiles, amdName, defines,
                isMainFile, versionInfo) {
  // Reading UMD headers and building loading orders of modules. The
  // readDependencies returns AMD module names: removing 'pdfjs' prefix and
  // adding '.js' extensions to the name.
  var umd = require('./external/umdutils/verifier.js');
  initFiles = initFiles.map(function (p) { return pathPrefix + p; });
  var files = umd.readDependencies(initFiles).loadOrder.map(function (name) {
    return pathPrefix + name.replace(/^[\w\-]+\//, '') + '.js';
  });

  var crlfchecker = require('./external/crlfchecker/crlfchecker.js');
  crlfchecker.checkIfCrlfIsPresent(files);

  var bundleContent = files.map(function (file) {
    var content = fs.readFileSync(file);

    // Prepend a newline because stripCommentHeaders only strips comments that
    // follow a line feed. The file where bundleContent is inserted already
    // contains a license header, so the header of bundleContent can be removed.
    content = stripCommentHeaders('\n' + content);

    // Removes AMD and CommonJS branches from UMD headers.
    content = stripUMDHeaders(content);

    return content;
  }).join('');

  var jsName = amdName.replace(/[\-_\.\/]\w/g, function (all) {
    return all[1].toUpperCase();
  });

  var p2 = require('./external/builder/preprocessor2.js');
  var ctx = {
    rootPath: __dirname,
    saveComments: 'copyright',
    defines: builder.merge(defines, {
      BUNDLE_VERSION: versionInfo.version,
      BUNDLE_BUILD: versionInfo.commit,
      BUNDLE_AMD_NAME: amdName,
      BUNDLE_JS_NAME: jsName,
      MAIN_FILE: isMainFile
    })
  };

  var templateContent = fs.readFileSync(filename).toString();
  templateContent = templateContent.replace(
    /\/\/#expand\s+__BUNDLE__\s*\n/, function (all) { return bundleContent; });
  bundleContent = null;

  templateContent = p2.preprocessPDFJSCode(ctx, templateContent);
  fs.writeFileSync(outfilename, templateContent);
  templateContent = null;
}

function createBundle(defines) {
  var versionJSON = JSON.parse(
    fs.readFileSync(BUILD_DIR + 'version.json').toString());

  console.log();
  console.log('### Bundling files into pdf.js');

  var mainFiles = [
    'display/global.js'
  ];

  var workerFiles = [
    'core/worker.js'
  ];

  var mainAMDName = 'pdfjs-dist/build/pdf';
  var workerAMDName = 'pdfjs-dist/build/pdf.worker';
  var mainOutputName = 'pdf.js';
  var workerOutputName = 'pdf.worker.js';

  // Extension does not need network.js file.
  if (!defines.FIREFOX && !defines.MOZCENTRAL) {
    workerFiles.push('core/network.js');
  }

  if (defines.SINGLE_FILE) {
    // In singlefile mode, all of the src files will be bundled into
    // the main pdf.js output.
    mainFiles = mainFiles.concat(workerFiles);
    workerFiles = null; // no need for worker file
    mainAMDName = 'pdfjs-dist/build/pdf.combined';
    workerAMDName = null;
    mainOutputName = 'pdf.combined.js';
    workerOutputName = null;
  }

  var state = 'mainfile';
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    var tmpFile;
    switch (state) {
      case 'mainfile':
        // 'buildnumber' shall create BUILD_DIR for us
        tmpFile = BUILD_DIR + '~' + mainOutputName + '.tmp';
        bundle('src/pdf.js', tmpFile, 'src/', mainFiles, mainAMDName,
          defines, true, versionJSON);
        this.push(new gutil.File({
          cwd: '',
          base: '',
          path: mainOutputName,
          contents: fs.readFileSync(tmpFile)
        }));
        fs.unlinkSync(tmpFile);
        state = workerFiles ? 'workerfile' : 'stop';
        break;
      case 'workerfile':
        // 'buildnumber' shall create BUILD_DIR for us
        tmpFile = BUILD_DIR + '~' + workerOutputName + '.tmp';
        bundle('src/pdf.js', tmpFile, 'src/', workerFiles, workerAMDName,
          defines, false, versionJSON);
        this.push(new gutil.File({
          cwd: '',
          base: '',
          path: workerOutputName,
          contents: fs.readFileSync(tmpFile)
        }));
        fs.unlinkSync(tmpFile);
        state = 'stop';
        break;
      case 'stop':
        this.push(null);
        break;
    }
  };
  return source;
}

function createWebBundle(defines) {
  var versionJSON = JSON.parse(
    fs.readFileSync(BUILD_DIR + 'version.json').toString());

  var template, files, outputName, amdName;
  if (defines.COMPONENTS) {
    amdName = 'pdfjs-dist/web/pdf_viewer';
    template = 'web/pdf_viewer.component.js';
    files = [
      'pdf_viewer.js',
      'pdf_history.js',
      'pdf_find_controller.js',
      'download_manager.js'
    ];
    outputName = 'pdf_viewer.js';
  } else {
    amdName = 'pdfjs-dist/web/viewer';
    outputName = 'viewer.js';
    template = 'web/viewer.js';
    files = ['app.js'];
    if (defines.FIREFOX || defines.MOZCENTRAL) {
      files.push('firefoxcom.js', 'firefox_print_service.js');
    } else if (defines.CHROME) {
      files.push('chromecom.js', 'pdf_print_service.js');
    } else if (defines.GENERIC) {
      files.push('pdf_print_service.js');
    }
  }

  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    // 'buildnumber' shall create BUILD_DIR for us
    var tmpFile = BUILD_DIR + '~' + outputName + '.tmp';
    bundle(template, tmpFile, 'web/', files, amdName, defines, false,
      versionJSON);
    this.push(new gutil.File({
      cwd: '',
      base: '',
      path: outputName,
      contents: fs.readFileSync(tmpFile)
    }));
    fs.unlinkSync(tmpFile);
    this.push(null);
  };
  return source;
}

function checkFile(path) {
  try {
    var stat = fs.lstatSync(path);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function createTestSource(testsName) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    console.log();
    console.log('### Running ' + testsName + ' tests');

    var PDF_TEST = process.env['PDF_TEST'] || 'test_manifest.json';
    var PDF_BROWSERS = process.env['PDF_BROWSERS'] ||
      'resources/browser_manifests/browser_manifest.json';

    if (!checkFile('test/' + PDF_BROWSERS)) {
      console.log('Browser manifest file test/' + PDF_BROWSERS +
                  ' does not exist.');
      console.log('Copy and adjust the example in ' +
                  'test/resources/browser_manifests.');
      this.emit('error', new Error('Missing manifest file'));
      return null;
    }

    var args = ['test.js'];
    switch (testsName) {
      case 'browser':
        args.push('--reftest', '--manifestFile=' + PDF_TEST);
        break;
      case 'browser (no reftest)':
        args.push('--manifestFile=' + PDF_TEST);
        break;
      case 'unit':
        args.push('--unitTest');
        break;
      case 'font':
        args.push('--fontTest');
        break;
      default:
        this.emit('error', new Error('Unknown name: ' + testsName));
        return null;
    }
    args.push('--browserManifestFile=' + PDF_BROWSERS);

    var testProcess = spawn('node', args, {cwd: TEST_DIR, stdio: 'inherit'});
    testProcess.on('close', function (code) {
      source.push(null);
    });
  };
  return source;
}

gulp.task('default', function() {
  console.log('Available tasks:');
  var tasks = Object.keys(gulp.tasks);
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log('  ' + taskName);
  });
});

gulp.task('extension', function (done) {
  console.log();
  console.log('### Building extensions');

  runSequence('locale', 'firefox', 'chromium', done);
});

gulp.task('buildnumber', function (done) {
  console.log();
  console.log('### Getting extension build number');

  exec('git log --format=oneline ' + config.baseVersion + '..',
      function (err, stdout, stderr) {
    var buildNumber = 0;
    if (!err) {
      // Build number is the number of commits since base version
      buildNumber = stdout ? stdout.match(/\n/g).length : 0;
    }

    console.log('Extension build number: ' + buildNumber);

    var version = config.versionPrefix + buildNumber;

    exec('git log --format="%h" -n 1', function (err, stdout, stderr) {
      var buildCommit = '';
      if (!err) {
        buildCommit = stdout.replace('\n', '');
      }

      createStringSource('version.json', JSON.stringify({
        version: version,
        build: buildNumber,
        commit: buildCommit
      }, null, 2))
        .pipe(gulp.dest(BUILD_DIR))
        .on('end', done);
    });
  });
});

gulp.task('bundle-firefox', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {FIREFOX: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-mozcentral', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {MOZCENTRAL: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-chromium', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {CHROME: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-singlefile', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {SINGLE_FILE: true});
  return createBundle(defines).pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-generic', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {GENERIC: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-minified', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {MINIFIED: true, GENERIC: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-components', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {COMPONENTS: true, GENERIC: true});
  return createWebBundle(defines).pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle', ['buildnumber'], function () {
  return createBundle(DEFINES).pipe(gulp.dest(BUILD_DIR));
});

gulp.task('jsdoc', function (done) {
  console.log();
  console.log('### Generating documentation (JSDoc)');

  var JSDOC_FILES = [
    'src/doc_helper.js',
    'src/display/api.js',
    'src/display/global.js',
    'src/shared/util.js',
    'src/core/annotation.js'
  ];

  var directory = BUILD_DIR + JSDOC_DIR;
  rimraf(directory, function () {
    mkdirp(directory, function () {
      var command = '"node_modules/.bin/jsdoc" -d ' + directory + ' ' +
                    JSDOC_FILES.join(' ');
      exec(command, done);
    });
  });
});

gulp.task('publish', ['generic'], function (done) {
  var version = JSON.parse(
    fs.readFileSync(BUILD_DIR + 'version.json').toString()).version;

  config.stableVersion = config.betaVersion;
  config.betaVersion = version;

  createStringSource(CONFIG_FILE, JSON.stringify(config, null, 2))
    .pipe(gulp.dest('.'))
    .on('end', function () {
      var targetName = 'pdfjs-' + version + '-dist.zip';
      gulp.src(BUILD_DIR + 'generic/**')
        .pipe(zip(targetName))
        .pipe(gulp.dest(BUILD_DIR))
        .on('end', function () {
          console.log('Built distribution file: ' + targetName);
          done();
        });
    });
});

gulp.task('test', function () {
  return streamqueue({ objectMode: true },
    createTestSource('unit'), createTestSource('browser'));
});

gulp.task('bottest', function () {
  return streamqueue({ objectMode: true },
    createTestSource('unit'), createTestSource('font'),
    createTestSource('browser (no reftest)'));
});

gulp.task('browsertest', function () {
  return createTestSource('browser');
});

gulp.task('browsertest-noreftest', function () {
  return createTestSource('browser (no reftest)');
});

gulp.task('unittest', function () {
  return createTestSource('unit');
});

gulp.task('fonttest', function () {
  return createTestSource('font');
});

gulp.task('botmakeref', function (done) {
  console.log();
  console.log('### Creating reference images');

  var PDF_BROWSERS = process.env['PDF_BROWSERS'] ||
    'resources/browser_manifests/browser_manifest.json';

  if (!checkFile('test/' + PDF_BROWSERS)) {
    console.log('Browser manifest file test/' + PDF_BROWSERS +
      ' does not exist.');
    console.log('Copy and adjust the example in ' +
      'test/resources/browser_manifests.');
    done(new Error('Missing manifest file'));
    return;
  }

  var args = ['test.js', '--masterMode', '--noPrompts',
              '--browserManifestFile=' + PDF_BROWSERS];
  var testProcess = spawn('node', args, {cwd: TEST_DIR, stdio: 'inherit'});
  testProcess.on('close', function (code) {
    done();
  });
});

gulp.task('unittestcli', function (done) {
  var args = ['JASMINE_CONFIG_PATH=test/unit/clitests.json'];
  var testProcess = spawn('node_modules/.bin/jasmine', args,
                          {stdio: 'inherit'});
  testProcess.on('close', function (code) {
    if (code !== 0) {
      done(new Error('Unit tests failed.'));
      return;
    }
    done();
  });
});

gulp.task('lint', function (done) {
  console.log();
  console.log('### Linting JS files');

  // Ensure that we lint the Firefox specific *.jsm files too.
  var options = ['node_modules/eslint/bin/eslint', '--ext', '.js,.jsm', '.'];
  var esLintProcess = spawn('node', options, {stdio: 'inherit'});
  esLintProcess.on('close', function (code) {
    if (code !== 0) {
      done(new Error('ESLint failed.'));
      return;
    }

    console.log();
    console.log('### Checking UMD dependencies');
    var umd = require('./external/umdutils/verifier.js');
    var paths = {
      'pdfjs': './src',
      'pdfjs-web': './web',
      'pdfjs-test': './test'
    };
    if (!umd.validateFiles(paths)) {
      done(new Error('UMD check failed.'));
      return;
    }

    console.log();
    console.log('### Checking supplemental files');

    
  };
});



var Student = sequelize.define('Student',{
  studentID: {
    type: Sequelize.INTEGER,
    primaryKey: true, 
    autoIncrement: true 
  },
  firstName: Sequelize.STRING,
  lastName: Sequelize.STRING,
  email: Sequelize.STRING,
  phone: Sequelize.STRING,
  addressStreet: Sequelize.STRING,
  addressCity: Sequelize.STRING,
  addressState: Sequelize.STRING,
  addressPostal: Sequelize.STRING,
  isInternationalStudent: Sequelize.BOOLEAN,
  expectedCredential: Sequelize.STRING,
  status: Sequelize.STRING,
  registrationDate: Sequelize.STRING
});

var Image = sequelize.define('Image', {
  imageId: {
    type: Sequelize.STRING,
    primaryKey: true  
  },
  imageUrl: Sequelize.STRING,
  version: Sequelize.INTEGER,
  width: Sequelize.INTEGER,
  height: Sequelize.INTEGER,
  format: Sequelize.STRING,
  resourceType: Sequelize.STRING,
  uploadedAt: Sequelize.DATE,
  originalFileName: Sequelize.STRING,
  mimeType: Sequelize.STRING
});

var Program = sequelize.define('Program', {
  programCode: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  programName: Sequelize.STRING
})

//define a relationship between Students and Programs, specifically
Program.hasMany(Student, {foreignKey: 'program'});

function initialize() {
  return new Promise((resolve, reject) => {
    sequelize.sync()
    .then(() => {
      resolve();
    })
    .catch((err) => {
      reject('unable to sync the database');
    })
  });
}

function getAllStudents() {
  return new Promise((resolve, reject) => {
    Student.findAll()
    .then((data) => {
      resolve(data);
    })
    .catch((err) => {
      reject('no results returned')
    })
  });
}

function getPrograms() {
  return new Promise((resolve, reject) => {
    sequelize.sync().then(function()
      {
        Program.findAll()
      .then((data) => {
        resolve(data);
      })
    })
    .catch((err) => {
      reject('no results returned')
      console.log(err)
    })
  });
}

function getStudentsByStatus(status) {
  return new Promise((resolve, reject) => {
    Student.findAll({
      where: {
        status: status
      }
    })
    .then((data) => {
      resolve(data);
    })
    .catch((err) => {
      reject('no results returned')
    })
  });
}
  
function getStudentsByProgramCode(program) {
  return new Promise((resolve, reject) => {
    sequelize.sync().then(function() {
      Student.findAll({ 
        where: { program: program }
      })
      .then(function(data){
          resolve(data);
      })
    })
    .catch(function(err) {
      reject(err);
    });
  });
}
  
function getStudentsByExpectedCredential(credential) {
  return new Promise((resolve, reject) => {
    sequelize.sync()
    .then(function(){
      Student.findAll({
          where: { expectedCredential: credential}
        })
        .then(function(data){
          resolve(data);
        })
    })
    .catch(function(err){
      reject(err);
    })
  });
}

function getStudentById(sid)
{
   return new Promise((resolve, reject) =>{
    sequelize.sync()
    .then(function() {
      Student.findAll({
        where: {studentID: sid}
      })
      .then(function(data){
        resolve(data[0])
      })
    })
    .catch(function(err){
      reject('Student not found', err)
    })
   })
}



function addStudent(studentData) {
  studentData.isInternationalStudent = (studentData.isInternationalStudent) ? true : false;
  for(let i in studentData){
    if(studentData[i] === ""){
      studentData[i] = null;
    }
  }
  return new Promise((resolve, reject) => {
    Student.create(studentData)
    .then(() => {
      resolve('Student created successfully')
    })
    .catch((err) => {
      reject('unable to create student')
    })
  });
}

function updateStudent(studentData) {
  studentData.isInternationalStudent = (studentData.isInternationalStudent) ? true : false;
  for(let i = 0; i < studentData.length; i++){
    if (studentData.hasOwnProperty(i) && studentData[i] === "") {
          studentData[i] = null;
        }
  }
  return new Promise((resolve, reject) => {
    Student.update(studentData, {
      where: {
        studentID: studentData.studentID
      }
    })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject("Unable to update student" + err);
        console.log(studentData)
      });
  });
}

function addImage(imageData) {
  return new Promise((resolve, reject) => {
    Image.create(imageData)
    .then((data) => {
      console.log(data)
      resolve(data);
    }).catch((err) => {
      reject("Unable to create image\n" + err);
    });
  });
}

function getImages() {
  return new Promise((resolve, reject) => {
    Image.findAll()
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        reject("no results returned\n" + err);
      });
  });
}

function addProgram(programData){
  return new Promise((resolve, reject) => {
    for(let i in programData){
      if(programData[i] && programData.hasOwnProperty(i) === ""){
        programData[i] = null;
      }
    }
    Program.create(programData)
    .then(() => {
      resolve()
    })
    .catch((err) => {
      reject('unable to create program')
      console.log(err);
    })
  })
}

function updateProgram(programData){
  return new Promise((resolve, reject) => {
    for(let i = 0; i< programData.length; i++){
      for(let i = 0; i < programData.length; i++){
        if(programData[i] = ""){
          programData[i] = null;
        }
      } 
    }
    Program.update(programData, {
      where: {programCode: programData.programCode}
    })
    .then((programData) => {
      resolve(programData);
    })
    .catch((err) => {
      reject("Unable to update student: " + err);
    })
  })
}

function getProgramByCode(pcode){
  return new Promise((resolve, reject) => {
    sequelize.sync()
    .then(() => {
      Program.findAll({
        where: {programCode: pcode}
      })
      .then((data) => {
        resolve(data[0])
      })
    })
    .catch((err) => {
      reject(err);
    })
  })
}

function deleteProgramByCode(pcode)
{
  return new Promise((resolve, reject) =>
  {
    sequelize.sync().then(() =>
    { 
      Program.destroy(
        { 
          where: { programCode: pcode }
        }).then(function()
        {
          console.log( pcode, " deleted");
           resolve();
        })

    }).catch((err) =>
    {
      reject("Fail to delete this program: ", err);
    });

  });
}

function deleteStudentById(id)
{
  return new Promise((resolve, reject)=>
  {
    sequelize.sync().then(function()
    { 
      Student.destroy(
        { 
          where: { studentID: id }
        }).then(() =>
        {
          console.log(id, " deleted");
           resolve();
        })

    }).catch((err) =>
    {
      reject("Fail to delete this program: ", err);
    });

  });

}

function ensureLogin(req, res, next) {
  if (!req.session.user) {
    res.redirect('/login');
  } else {
    next();
  }
}

module.exports = {
  initialize,
  getAllStudents,
  getPrograms,
  addImage,
  getImages,
  addStudent,
  getStudentsByStatus,
  getStudentsByProgramCode,
  getStudentsByExpectedCredential,
  getStudentById,
  updateStudent,
  addProgram,
  updateProgram,
  getProgramByCode,
  deleteProgramByCode,
  deleteStudentById,
  ensureLogin
};

