// app.js
const express = require("express");
const sizeof = require('object-sizeof')
const app = express();
const NodeCache = require("node-cache");
const config = require("./config");
const { renderStats } = require('./stats');
const bn = require("bignum");

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

app.get("/stats", function(req, res, next){
  res.send(renderStats(req, channelCache, dataCache))
})

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
  // Limit TTL values
  if (requestedTtl) {
    console.log(`client requested TTL: ${requestedTtl}`)
    if (requestedTtl > config.maxTTL) {
      res.status(400).json({error: `requested TTL ${requestedTtl} too high`});
      return;
    } else if (requestedTtl < config.minTTL) {
      res.status(400).json({error: `requested TTL ${requestedTtl} too low`});
    }
  }

  // use default TTL if nothing provided by client
  const ttl = requestedTtl || config.defaultTTL

  let channel = channelCache.get(channelId)
  if (!channel) {
    // Create new channel.
    channel = {
      entries: new Map(),
      size: 0,
      ttl
    }
    // save channel in cache with requested TTL
    channelCache.set(channelId, channel, ttl)
    console.log(`Created new channel ${channelId} with TTL ${channel.ttl}`)
  } else {
    // existing channel. check if this channel was about to expire, but got another upload
    if (channel.entries.size === 0) {
      console.log(`Restoring requested TTL ${channel.ttl} for channel ${channelId}`)
      channelCache.ttl(channelId, channel.ttl)
    }
  }

  // Check if there is already data with the provided uuid to prevent duplicates
  const existingData = channel.entries.get(uuid)
  if (existingData) {
    if (existingData === data) {
      console.log(`Received duplicate profile ${uuid} for channel ${channelId}`)
      // Workaround for recovery channels: interpret upload of existing data as request to extend TTL of channel
      // TODO: Remove ttl extension when client that knows how to create channels with longer ttl time is released
      channelCache.ttl(channelId, channel.ttl)
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
    channel.entries.set(uuid, data)
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
  const data = channel.entries.get(uuid)
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
  const data = channel.entries.get(uuid)
  if (!data) {
    res.status(404).json({error: `Data ${uuid} in channel ${channelId} not found`});
    return;
  }

  // remove entry
  const deleted = channel.entries.delete(uuid)
  if (!deleted) {
    // No entry deleted although it exists??
    res.status(500).json({error: `Data ${uuid} in channel ${channelId} could not be deleted`});
    return;
  }

  // update channel size
  channel.size -= sizeof(data) + sizeof(uuid)

  console.log(`Deleted ${uuid} from channel ${channelId}. New size: ${channel.size}`)

  // handle removing of last entry
  if (channel.entries.size === 0) {

    // if channel is empty size should also be 0. Double-check.
    if (channel.size !== 0) {
      console.warn(`Channel size calculation incorrect. This should not happen.`)
      channel.size = 0;
    }

    // Reduce remaining TTL. Leave a few minutes TTL in case some upload is
    // hanging from a slow connection
    const expirationTime = channelCache.getTtl(channelId); // This actually returns a unix timestamp in ms(!) when channel will expire
    const remainingTTL = expirationTime - Date.now()
    if (remainingTTL > config.finalTTL) {
      console.log(`last element removed from channel ${channelId}. Reducing TTL from ${Math.floor(remainingTTL/1000)} to ${config.finalTTL} secs.`)
      channelCache.ttl(channelId, config.finalTTL)
    } else {
      console.log(`last element removed from channel ${channelId}. Remaining TTL: ${remainingTTL}ms.`)
      channelCache.ttl(channelId, config.finalTTL)
    }
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

  if (!channel.entries) {
    res.status(500).json({error: `Map for channel ${channelId} not existing`});
    return;
  }

  res.json({
    profileIds: Array.from(channel.entries.keys()) // channel.entries.keys()
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

app.get("/modpow", function (req, res, next) {
  const { a, exp, b } = req.query;
  res.json({
    data: bn(a).powm(bn(exp), bn(b)).toString(),
  });
});

module.exports = app;
