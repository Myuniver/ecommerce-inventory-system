const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise");

const app = express();
app.use(bodyParser.json());

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "password",   // ⚠️ change if your MySQL password is different
  database: "inventory",
});

app.get("/", (req, res) => {
  res.send("Inventory API running");
});

app.post("/products", async (req, res) => {
  const { name, sku } = req.body;

  const [result] = await pool.query(
    "INSERT INTO products(name, sku) VALUES(?, ?)",
    [name, sku]
  );

  await pool.query(
    "INSERT INTO inventory(product_id, available) VALUES(?, 0)",
    [result.insertId]
  );

  res.json({ id: result.insertId, name, sku });
});

app.post("/inventory/add", async (req, res) => {
  const { productId, qty } = req.body;

  await pool.query(
    "UPDATE inventory SET available = available + ? WHERE product_id=?",
    [qty, productId]
  );

  res.send("Stock added");
});

app.post("/orders", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { productId, qty } = req.body;

    const [rows] = await connection.query(
      "SELECT * FROM inventory WHERE product_id=? FOR UPDATE",
      [productId]
    );

    if (rows.length === 0) throw new Error("Product not found");

    if (rows[0].available < qty)
      throw new Error("Not enough stock");

    await connection.query(
      "UPDATE inventory SET available=available-?, reserved=reserved+? WHERE product_id=?",
      [qty, qty, productId]
    );

    const [order] = await connection.query(
      "INSERT INTO orders(status) VALUES('RESERVED')"
    );

    await connection.query(
      "INSERT INTO order_items(order_id, product_id, quantity) VALUES(?,?,?)",
      [order.insertId, productId, qty]
    );

    await connection.commit();
    res.json({ orderId: order.insertId });

  } catch (err) {
    await connection.rollback();
    res.status(400).send(err.message);
  } finally {
    connection.release();
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
