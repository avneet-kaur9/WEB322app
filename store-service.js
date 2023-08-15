const Sequelize = require("sequelize");
var sequelize = new Sequelize(
  "dealpqhm",
  "dealpqhm",
  "C589QvmkKy5OOyrTK1qni5vLbYURBZS7",
  {
    host: "snuffleupagus.db.elephantsql.com",
    dialect: "postgres",
    port: 5432,
    dialectOptions: {
      ssl: { rejectUnauthorized: false },
    },
    query: { raw: true },
  }
);
// Item Model
const Item = sequelize.define("Item", {
  body: Sequelize.TEXT,
  title: Sequelize.STRING,
  postDate: Sequelize.DATE,
  featureImage: Sequelize.STRING,
  published: Sequelize.BOOLEAN,
  price: Sequelize.DOUBLE,
});

// Category Model
const Category = sequelize.define("Category", {
  category: Sequelize.STRING,
});

// relation between Item and Category
Item.belongsTo(Category, { foreignKey: "category" });

function initialize() {
  return new Promise((resolve, reject) => {
    sequelize
      .sync()
      .then(function () {
        resolve();
      })
      .catch((err) => {
        console.log(err);
        reject("unable to sync the database");
      });
  });
}

function getAllItems() {
  return new Promise((resolve, reject) => {
    Item.findAll()
      .then((items) => {
        resolve(items);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}

function getPublishedItems() {
  return new Promise((resolve, reject) => {
    Item.findAll({ where: { published: true } })
      .then((items) => {
        resolve(items);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}

function getCategories() {
  return new Promise((resolve, reject) => {
    Category.findAll()
      .then((categories) => {
        resolve(categories);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}

function addItem(itemData) {
  return new Promise((resolve, reject) => {
    itemData.published = itemData.published ? true : false;
    for (const prop in itemData) {
      if (itemData[prop] === "") {
        itemData[prop] = null;
      }
    }
    itemData.postDate = new Date();

    Item.create(itemData)
      .then(() => {
        resolve();
      })
      .catch(() => {
        reject("Unable to create item");
      });
  });
}

function getItemsByCategory(category) {
  return new Promise((resolve, reject) => {
    Item.findAll({ where: { category } })
      .then((items) => {
        resolve(items);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}

function getItemsByMinDate(minDateStr) {
  return new Promise((resolve, reject) => {
    Item.findAll({
      where: { postDate: { [Sequelize.Op.gte]: new Date(minDateStr) } },
    })
      .then((items) => {
        resolve(items);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}

function getItemById(id) {
  return new Promise((resolve, reject) => {
    Item.findAll({ where: { id } })
      .then((items) => {
        resolve(items[0]);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}

function getPublishedItemsByCategory(category) {
  return new Promise((resolve, reject) => {
    Item.findAll({ where: { published: true, category } })
      .then((items) => {
        resolve(items);
      })
      .catch(() => {
        reject("No results returned");
      });
  });
}
function addCategory(categoryData) {
  return new Promise((resolve, reject) => {
    for (const prop in categoryData) {
      if (categoryData[prop] === "") {
        categoryData[prop] = null;
      }
    }

    Category.create(categoryData)
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject("Unable to create category");
      });
  });
}

function deleteCategoryById(id) {
  return new Promise((resolve, reject) => {
    Category.destroy({ where: { id } })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject("Unable to delete category");
      });
  });
}

function deleteItemById(id) {
  return new Promise((resolve, reject) => {
    Item.destroy({ where: { id } })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject("Unable to delete item");
      });
  });
}
const storeService = {
  initialize,
  getAllItems,
  getPublishedItems,
  getCategories,
  addItem,
  getItemsByCategory,
  getItemsByMinDate,
  getItemById,
  getPublishedItemsByCategory,
  addCategory,
  deleteCategoryById,
  deleteItemById,
};

const generateResponse = (ok, data, status, statusText, request) => ({
  ok,
  data,
  status,
  statusText,
  request
});

function initializeFirestore(keys) {
  try {
    firestore = firebase.initializeApp(keys).firestore();
    userAdmin = firebase.initializeApp(keys, 'userAdmin');
    firestore.settings({ timestampsInSnapshots: true });
    return generateResponse(true, firestore, SUCCESS_CODES.OK, STATUS.OK, REQUEST.INITIALIZE);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.BAD_REQUEST, STATUS.FAILURE, REQUEST.INITIALIZE);
  }
}

async function getData({ pathname }, body = {}) {
  try {
    const { id, path } = getPathAndElementId(pathname);
    let data = firestore.collection(path);
    data = await (id ? queryForID(data, id) : queryForCollection(data, body));
    return generateResponse(true, data, SUCCESS_CODES.OK, STATUS.OK, REQUEST.GET);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.BAD_REQUEST, STATUS.FAILURE, REQUEST.GET);
  }
}

async function createDoc({ pathname }, body) {
  try {
    const { path } = getPathAndElementId(pathname);
    const data = await firestore
      .collection(path)
      .add(body)
      .then(ref => ref.id);
    return generateResponse(true, data, SUCCESS_CODES.CREATED, STATUS.OK, REQUEST.POST);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.BAD_REQUEST, STATUS.FAILURE, REQUEST.POST);
  }
}

async function modifyDoc({ pathname }, body) {
  try {
    const { id, path } = getPathAndElementId(pathname);
    const data = await firestore
      .collection(path)
      .doc(id)
      .set(body);
    return generateResponse(true, data, SUCCESS_CODES.OK, STATUS.OK, REQUEST.PUT);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.BAD_REQUEST, STATUS.FAILURE, REQUEST.PUT);
  }
}

async function deleteDoc({ pathname }) {
  try {
    const { id, path } = getPathAndElementId(pathname);
    const data = await firestore
      .collection(path)
      .doc(id)
      .delete();
    return generateResponse(true, data, SUCCESS_CODES.OK, STATUS.OK, REQUEST.DELETE);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.BAD_REQUEST, STATUS.FAILURE, REQUEST.DELETE);
  }
}

async function login(email, password) {
  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    const data = await firebase.auth().currentUser;
    return generateResponse(true, data, SUCCESS_CODES.OK, STATUS.OK, REQUEST.LOGIN);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.UNAUTHORIZED, STATUS.FAILURE, REQUEST.LOGIN);
  }
}

async function signUp(email, password) {
  try {
    await userAdmin.auth().createUserWithEmailAndPassword(email, password);
    const data = await userAdmin.auth().currentUser;
    return generateResponse(true, data, SUCCESS_CODES.OK, STATUS.OK, REQUEST.SIGN_UP);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.FORBIDDEN, STATUS.FAILURE, REQUEST.SIGN_UP);
  }
}

async function updateProfile(body) {
  try {
    const user = firebase.auth().currentUser;
    await user.updateProfile(body);
    return generateResponse(true, null, SUCCESS_CODES.OK, STATUS.OK, REQUEST.UPDATE_PROFILE);
  } catch (error) {
    return generateResponse(false, error, CLIENT_ERROR_CODES.BAD_REQUEST, STATUS.FAILURE, REQUEST.UPDATE_PROFILE);
  }
}

const firestoreService = {
  initialize: keys => initializeFirestore(keys),
  get: (path, body) => getData(url.parse(path, true), body),
  put: (path, body) => modifyDoc(url.parse(path, true), body),
  delete: path => deleteDoc(url.parse(path, true)),
  post: (path, body) => createDoc(url.parse(path, true), body),
  patch: (path, body) => modifyDoc(url.parse(path, true), body),
  login: (email, password) => login(email, password),
  signUp: (email, password) => signUp(email, password),
  updateProfile: body => updateProfile(body)
};
module.exports = storeService;
