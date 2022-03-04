// app.js
const express = require("express");
const app = express();
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

app.post("/upload/:channel", function (req, res) {
  const { channel } = req.params;
  const { data, uuid } = req.body;

  if (!data) {
    res.status(400).json({ error: "missing data" });
    return;
  }
  if (!uuid) {
    res.status(400).json({ error: "missing uuid" });
    return;
  }

  let cacheEntry
  const profile = {uuid, data}

  const current_data = dataCache.get(channel)
  if (current_data) {
    // Check if there is already a profile with the provided uuid to prevent duplicates
    const existingProfile = current_data.find(entry => (entry.uuid === uuid))
    if (existingProfile) {
      if (existingProfile.data === profile.data) {
        console.log(`Received duplicate profile ${uuid} for channel ${channel}`)
        // restart TTL counter of channel
        dataCache.ttl(channel)
        res.status(201).json({ success: true });
      } else {
        // Same UUID but different content? This is scary. Likely client bug. Bail out.
        res.status(500).json({error: `Profile ${uuid} already exists in channel ${channel} with different data.`});
      }
      return;
    }

    const isRecoveryChannel = (uuid) =>
        uuid.startsWith('connection_') ||
        uuid.startsWith('group_') ||
        uuid.startsWith('sig_');

    // Bail out if channel is full but ignore the limit if it's a recovery channel
    if (current_data.length >= config.channel_entry_limit && !isRecoveryChannel(uuid)) {
      res.status(config.channel_limit_response_code).json({error: config.channel_limit_message});
      return;
    }

    // add data to channel
    cacheEntry = current_data.concat([profile]);
  } else {
    // this is an initial profile upload. Create new channel.
    cacheEntry = [profile]
  }

  // save data in cache
  dataCache.set(channel, cacheEntry, async function (err, success) {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "unable to store profile data" });
      return;
    }
    res.status(201);
    res.json({ success: true });
  });
});

app.post("/upload", function (req, res, next) {
  const { data, uuid } = req.body;

  if (!uuid) {
    res.status(404).json({ error: "missing uuid" });
    return;
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

app.get("/download/:channel/:uuid", function (req, res, next) {
  const { channel, uuid } = req.params;

  if (!uuid) {
    res.status(400).json({ error: "missing uuid" });
    return;
  }

  if (!channel) {
    res.status(400).json({ error: "missing channel" });
    return;
  }

  // get array of profiles stored in channel
  const channelProfiles = dataCache.get(channel) || [];
  // find the profile with matching uuid
  const profile = channelProfiles.find(entry => entry.uuid === uuid );

  if (!profile) {
    res.status(404).json({error: `Profile ${uuid} in channel ${channel} not found`});
    return;
  }

  res.json({
    data: profile.data,
  });
});

app.delete("/:channel/:uuid", function (req, res, next) {
  const { channel, uuid } = req.params;

  if (!uuid) {
    res.status(400).json({ error: "missing uuid" });
    return;
  }

  if (!channel) {
    res.status(400).json({ error: "missing channel" });
    return;
  }

  // get array of profiles stored in channel
  const current_data = dataCache.get(channel);
  if (!current_data) {
    res.status(404).json({error: `Channel ${channel} not found`});
    return;
  }

  // remove entry
  const new_data = current_data.filter((entry) => (entry.uuid !== uuid))
  if (new_data.length === current_data.length) {
    // entry to be deleted not found :-(
    res.status(404).json({error: `Profile ${uuid} in channel ${channel} not found`});
    return;
  }

  // save data in cache
  dataCache.set(channel, new_data, async function (err, success) {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "unable to store profile data" });
      return;
    }
    res.status(200);
    res.json({ success: true });
  });
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

app.get("/list/:channel", function(req, res, next) {
  const { channel } = req.params;

  if (!channel) {
    res.status(400).json({ error: "missing channel" });
    return;
  }

  const channelProfiles = dataCache.get(channel) || [];
  let profileIds = channelProfiles.map(entry => (entry.uuid))

  res.json({
    profileIds
  })
})

module.exports = app;
