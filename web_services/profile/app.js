// app.js
const express = require("express");
const app = express();
const axios = require("axios");
const NodeCache = require("node-cache");
const config = require("./config");

const dataCache = new NodeCache(config.node_cache);

// BodyParser Middleware
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

if (config.is_dev) {
  app.use(express.static(__dirname + "/node_modules"));
  app.get("/test", function (req, res, next) {
    res.sendFile(__dirname + "/index.html");
  });
}

app.get("/", function (req, res, next) {
  res.send("BrightID socket server");
});

app.post("/upload", function (req, res, next) {
  const { data, uuid, multiple } = req.body;

  if (!uuid) {
    res.status(404).json({ error: "missing uuid" });
    return;
  }
  // support multiple upload to the same channel if `multiple` is set to true
  if (multiple === "true") {
    const current_data = dataCache.get(uuid) || [];
    data = current_data.concat([data]);
  }

  // save data in cache
  if (data) {
    dataCache.set(uuid, data, async function (err, success) {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "unable to store profile data" });
        return;
      }
      res.json({ success: true });
    });
  } else {
    res.status(404).json({ error: "missing data" });
  }
});

app.get("/download/:uuid", function (req, res, next) {
  const { uuid } = req.params;

  if (!uuid) {
    res.status(404).json({ error: "missing uuid" });
    return;
  }

  const data = dataCache.get(uuid) || null;

  res.json({
    data,
  });
});

module.exports = app;
