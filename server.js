/*********************************************************************************
 *  WEB322 – Assignment 05
 *  I declare that this assignment is my own work in accordance with Seneca  Academic Policy.  No part of this
 *  assignment has been copied manually or electronically from any other source (including web sites) or
 *  distributed to other students.
 *
 *  Name: Avneet Kaur 
 * Student ID: 164275216 
 * Date: 23/07/2023
 *
 *  Cyclic Web App URL: https://gray-gleaming-mussel.cyclic.app
 *
 *  GitHub Repository URL: https://github.com/avneet-kaur/WEB322app.git
 *
 ********************************************************************************/

const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const exphbs = require("express-handlebars");

const store = require("./store-service");

const app = express();
const PORT = process.env.PORT || 8080;

// configure cloudinary
cloudinary.config({
  cloud_name: "dwjorvqny",
  api_key: "211775142187592",
  api_secret: "gaw0_Icooa3XtJzPf21UScgtgS4",
  secure: true,
});

const upload = multer();

app.use(express.static(__dirname + "/public"));
app.use(express.urlencoded({ extended: true }));

// configure handlebars as view engine
app.engine(
  ".hbs",
  exphbs.engine({
    extname: ".hbs",
    helpers: {
      navLink: function (url, options) {
        return (
          '<li class="nav-item"> <a ' +
          (app.locals.activeRoute === url
            ? 'class="nav-link active"'
            : 'class="nav-link"') +
          ' href="' +
          url +
          '" >' +
          options.fn(this) +
          "</a> </li>"
        );
      },
      equal: function (lvalue, rvalue, options) {
        if (arguments.length < 3)
          throw new Error("Handlebars Helper equal needs 2 parameters");
        if (lvalue != rvalue) {
          return options.inverse(this);
        } else {
          return options.fn(this);
        }
      },
      formatDate: function (dateObj) {
        let year = dateObj.getFullYear();
        let month = (dateObj.getMonth() + 1).toString();
        let day = dateObj.getDate().toString();
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      },
    },
  })
);
app.set("view engine", ".hbs");
app.set("views", __dirname + "/views");

// active route/ link
app.use(function (req, res, next) {
  let route = req.path.substring(1);
  app.locals.activeRoute =
    "/" +
    (isNaN(route.split("/")[1])
      ? route.replace(/\/(?!.*)/, "")
      : route.replace(/\/(.*)/, ""));
  app.locals.viewingCategory = req.query.category;
  next();
});

app.get("/", (req, res) => {
  res.redirect("/about");
});

app.get("/about", (req, res) => {
  res.render("about");
});

// GET route for "/shop"
app.get("/shop", async (req, res) => {
  // Declare an object to store properties for the view
  let viewData = {};

  try {
    // declare empty array to hold "post" objects
    let items = [];

    // if there's a "category" query, filter the returned posts by category
    if (req.query.category) {
      // Obtain the published "posts" by category
      items = await store.getPublishedItemsByCategory(req.query.category);
    } else {
      // Obtain the published "items"
      items = await store.getPublishedItems();
    }

    // sort the published items by postDate
    items.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));

    // get the latest post from the front of the list (element 0)
    let item = items[0];

    // store the "items" and "post" data in the viewData object (to be passed to the view)
    viewData.items = items;
    viewData.item = item;
  } catch (err) {
    viewData.message = "no results";
  }

  try {
    // Obtain the full list of "categories"
    let categories = await store.getCategories();

    // store the "categories" data in the viewData object (to be passed to the view)
    viewData.categories = categories;
  } catch (err) {
    viewData.categoriesMessage = "no results";
  }

  // render the "shop" view with all of the data (viewData)
  res.render("shop", { data: viewData });
});

app.get("/shop/:id", async (req, res) => {
  // Declare an object to store properties for the view
  let viewData = {};

  try {
    // declare empty array to hold "item" objects
    let items = [];

    // if there's a "category" query, filter the returned posts by category
    if (req.query.category) {
      // Obtain the published "posts" by category
      items = await store.getPublishedItemsByCategory(req.query.category);
    } else {
      // Obtain the published "posts"
      items = await store.getPublishedItems();
    }

    // sort the published items by postDate
    items.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));

    // store the "items" and "item" data in the viewData object (to be passed to the view)
    viewData.items = items;
  } catch (err) {
    viewData.message = "no results";
  }

  try {
    // Obtain the item by "id"
    viewData.item = await store.getItemById(req.params.id);
  } catch (err) {
    viewData.message = "no results";
  }

  try {
    // Obtain the full list of "categories"
    let categories = await store.getCategories();

    // store the "categories" data in the viewData object (to be passed to the view)
    viewData.categories = categories;
  } catch (err) {
    viewData.categoriesMessage = "no results";
  }

  // render the "shop" view with all of the data (viewData)
  res.render("shop", { data: viewData });
});

// GET route for "/items"
app.get("/items", (req, res) => {
  const { category, minDate } = req.query;
  let promise;

  if (category) {
    promise = store.getItemsByCategory(category);
  } else if (minDate) {
    promise = store.getItemsByMinDate(minDate);
  } else {
    promise = store.getAllItems();
  }

  promise
    .then((items) => {
      if (items.length > 0) res.render("items", { items });
      else res.render("items", { message: "no results" });
    })
    .catch((err) => {
      res.render("items", { message: err });
    });
});

// GET route for "/categories"
app.get("/categories", (req, res) => {
  store
    .getCategories()
    .then((categories) => {
      if (categories.length > 0) {
        res.render("categories", { categories });
      } else {
        res.render("categories", { message: "no results" });
      }
    })
    .catch((err) => {
      res.status(500).render("categories", { message: err });
    });
});

// show add items form
app.get("/items/add", (req, res) => {
  store
    .getCategories()
    .then((categories) => {
      res.render("addItem", { categories });
    })
    .catch((er) => {
      res.render("addItem", { categories: [] });
    });
});

// submitting add item form
app.post("/items/add", upload.single("featureImage"), (req, res) => {
  if (req.file) {
    let streamUpload = (req) => {
      return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream((error, result) => {
          if (result) {
            resolve(result);
          } else {
            reject(error);
          }
        });

        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
    };

    async function upload(req) {
      let result = await streamUpload(req);
      console.log(result);
      return result;
    }

    upload(req).then((uploaded) => {
      processItem(uploaded.url);
    });
  } else {
    processItem("");
  }

  function processItem(imageUrl) {
    req.body.featureImage = imageUrl;

    store
      .addItem(req.body)
      .then(() => {
        res.redirect("/items");
      })
      .catch((err) => {
        res.status(500).json({ message: err });
      });
  }
});

app.get("/item/:value", (req, res) => {
  store
    .getItemById(req.params.value)
    .then((item) => {
      res.json(item);
    })
    .catch((err) => {
      res.json({ message: err });
    });
});

app.get("/categories/add", (req, res) => {
  res.render("addCategory");
});

app.post("/categories/add", (req, res) => {
  store
    .addCategory(req.body)
    .then(() => {
      res.redirect("/categories");
    })
    .catch(() => {
      res.status(500).send("Unable to add category");
    });
});

app.get("/categories/delete/:id", (req, res) => {
  store
    .deleteCategoryById(req.params.id)
    .then(() => {
      res.redirect("/categories");
    })
    .catch((err) => {
      res.status(500).send("Unable to remove category / Category not found");
    });
});
// delete item
app.get("/items/delete/:id", (req, res) => {
  store
    .deleteItemById(req.params.id)
    .then(() => {
      res.redirect("/items");
    })
    .catch(() => {
      res.status(500).send("Unable to remove item / Item not found");
    });
});
// 404 route handler
app.use((req, res) => {
  res.status(404).render("404");
});

store
  .initialize()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Express http server listening on: ${PORT}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });
