// app.js
const express = require("express");
const sizeof = require('object-sizeof')
const app = express();
const NodeCache = require("node-cache");
const config = require("./config");

const dataCache = new NodeCache(config.data_cache_config);
const channelCache = new NodeCache(config.channel_config);

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

app.post("/upload/:channelId", function (req, res) {
  const { channelId } = req.params;
  const { data, uuid, requestedTtl } = req.body;

  if (!data) {
    res.status(400).json({ error: "missing data" });
    return;
  }
  if (!uuid) {
    res.status(400).json({ error: "missing uuid" });
    return;
  }
  // Don't allow too high TTL values
  if (requestedTtl && requestedTtl > config.stdTTL) {
    res.status(400).json({ error: "requested TTL too high" });
    return;
  }

  // use standard TTL if nothing provided by client
  const ttl = requestedTtl || config.stdTTL

  let channel = channelCache.get(channelId)
  if (!channel) {
    // Create new channel.
    channel = {
      cache: new NodeCache(config.channel_entry_config),
      size: 0,
      ttl
    }
    // save channel in cache with requested TTL
    channelCache.set(channelId, channel, ttl)
  } else {
    // existing channel. check if this channel was about to expire, but got another upload
    if (channel.cache.keys().length === 0) {
      console.log(`Restoring requested TTL ${channel.ttl} for channel ${channelId}`)
      channelCache.ttl(channelId, channel.ttl)
    }
  }

  // Check if there is already data with the provided uuid to prevent duplicates
  const existingData = channel.cache.get(uuid)
  if (existingData) {
    if (existingData === data) {
      console.log(`Received duplicate profile ${uuid} for channel ${channelId}`)
      // restart TTL counter of channel
      // TODO: Not needed anymore? channel has default lifetime of 24 hours!
      channelCache.ttl(channelId, channel.requestedTtl)
      res.status(201).json({ success: true });
    } else {
      // Same UUID but different content? This is scary. Likely client bug. Bail out.
      res.status(500).json({error: `Profile ${uuid} already exists in channel ${channelId} with different data.`});
    }
    return;
  }

  // check channel size
  const entrySize = sizeof(data) + sizeof(uuid)
  const newSize = channel.size + entrySize
  console.log(`channel ${channelId} newSize: ${newSize},\t delta: ${entrySize} bytes`)
  if (newSize > config.channel_max_size_bytes) {
    // channel full :-(
    res.status(config.channel_limit_response_code).json({error: config.channel_limit_message});
    return;
  }

  // save data in cache
  try {
    channel.cache.set(uuid, data)
    channel.size = newSize
    res.status(201);
    res.json({ success: true });
  } catch (e) {
    console.log(err);
    res.status(500).json({ error: "unable to store channel data" });
  }
});

app.get("/download/:channelId/:uuid", function (req, res, next) {
  const { channelId, uuid } = req.params;

  if (!uuid) {
    res.status(400).json({ error: "missing uuid" });
    return;
  }

  if (!channelId) {
    res.status(400).json({ error: "missing channel" });
    return;
  }

  // get channel
  const channel = channelCache.get(channelId)
  if (!channel) {
    res.status(404).json({error: `Channel ${channelId} not found`});
    return;
  }

  // get data
  const data = channel.cache.get(uuid)
  if (!data) {
    res.status(404).json({error: `Data ${uuid} in channel ${channelId} not found`});
    return;
  }

  res.json({
    data: data,
  });
});

app.delete("/:channelId/:uuid", function (req, res, next) {
  const { channelId, uuid } = req.params;

  if (!uuid) {
    res.status(400).json({ error: "missing uuid" });
    return;
  }

  if (!channelId) {
    res.status(400).json({ error: "missing channelId" });
    return;
  }

  // get channel
  const channel = channelCache.get(channelId)
  if (!channel) {
    res.status(404).json({error: `Channel ${channelId} not found`});
    return;
  }

  // get data (needed to track channel size)
  const data = channel.cache.get(uuid)
  if (!data) {
    res.status(404).json({error: `Data ${uuid} in channel ${channelId} not found`});
    return;
  }

  // remove entry
  const numDeleted = channel.cache.del(uuid)
  if (numDeleted === 0) {
    // No entry deleted although it exists??
    res.status(500).json({error: `Profile ${uuid} in channel ${channelId} could not be deleted`});
    return;
  }

  // update channel size
  channel.size -= sizeof(data) + sizeof(uuid)

  console.log(`Deleted ${uuid} from channel ${channelId}. New size: ${channel.size}`)

  // if the last entry was deleted, prepare the channel for deletion. Leave a few minutes TTL in case some upload was
  // hanging from a slow connection
  if (channel.cache.keys().length === 0) {
    console.log(`last element removed from channel ${channelId}. Setting reduced TTL ${config.finalTTL}.`)
    channelCache.ttl(channelId, config.finalTTL)
  }
  res.status(200);
  res.json({ success: true });
});

app.get("/list/:channelId", function(req, res, next) {
  const { channelId } = req.params;

  if (!channelId) {
    res.status(400).json({ error: "missing channelId" });
    return;
  }

  // get channel
  const channel = channelCache.get(channelId)
  if (!channel) {
    // Don't fail when channel is not existing. Instead return empty array
    // res.status(404).json({error: `Channel ${channelId} not found`});
    res.json({
      profileIds: []
    })
    return;
  }

  if (!channel.cache) {
    res.status(500).json({error: `Cache for channel ${channelId} not existing`});
    return;
  }

  res.json({
    profileIds: channel.cache.keys()
  })
})


/**
 * Legacy methods for upload/download without using channels below
 **/
app.post("/upload", function (req, res, next) {
  const { data, uuid } = req.body;

  if (!uuid) {
    res.status(404).json({ error: "missing uuid" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "missing data" });
    return;
  }

  // save data in cache
  try {
    dataCache.set(uuid, data)
    res.json({ success: true });
  }
  catch (e) {
    console.log(err);
    res.status(500).json({ error: "unable to store profile data" });
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
