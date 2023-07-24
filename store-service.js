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

module.exports = storeService;
