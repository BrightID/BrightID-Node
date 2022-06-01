const arango = require("@arangodb").db;
const db = require("./db");
const { query } = require("@arangodb");

const collections = {
  connections: "edge",
  connectionsHistory: "edge",
  groups: "document",
  usersInGroups: "edge",
  users: "document",
  // this collection should be dropped when v5 drops
  contexts: "document",
  apps: "document",
  sponsorships: "edge",
  operations: "document",
  operationsHashes: "document",
  invitations: "edge",
  variables: "document",
  verifications: "document",
  // this collection should be dropped when v5 drops
  testblocks: "document",
  cachedParams: "document",
  signedVerifications: "document",
  appIds: "document",
};

// deprecated collections should be added to this array after releasing
// second update to allow 2 last released versions work together
const deprecated = ["removed", "newGroups", "usersInNewGroups"];

const indexes = [
  { collection: "verifications", fields: ["user"], type: "persistent" },
  { collection: "verifications", fields: ["name"], type: "persistent" },
  { collection: "verifications", fields: ["block"], type: "persistent" },
  {
    collection: "sponsorships",
    fields: ["expireDate"],
    type: "ttl",
    expireAfter: 0,
  },
  { collection: "sponsorships", fields: ["contextId"], type: "persistent" },
  { collection: "connections", fields: ["level"], type: "persistent" },
  {
    collection: "connectionsHistory",
    fields: ["timestamp"],
    type: "persistent",
  },
  { collection: "groups", fields: ["seed"], type: "persistent" },
  { collection: "groups", fields: ["type"], type: "persistent" },
  { collection: "groups", fields: ["head"], type: "persistent" },
  { collection: "operations", fields: ["state"], type: "persistent" },
  {
    collection: "cachedParams",
    fields: ["creationDate"],
    type: "ttl",
    expireAfter: 600,
  },
  { collection: "appIds", fields: ["uid"], type: "persistent" },
  { collection: "appIds", fields: ["app", "appId"], type: "persistent" },
];

const variables = [
  { _key: "LAST_DB_UPGRADE_V6", value: -1 },
  { _key: "VERIFICATIONS_HASHES", hashes: "{}" },
  { _key: "VERIFICATION_BLOCK", value: 0 },
  // 2021/02/09 as starting point for applying new seed connected
  { _key: "PREV_SNAPSHOT_TIME", value: 1612900000 },
];

const variablesColl = arango._collection("variables");

function createCollections() {
  console.log("creating collections if they do not exist ...");
  for (let collection in collections) {
    const coll = arango._collection(collection);
    if (coll) {
      console.log(`${collection} exists`);
    } else {
      const type = collections[collection];
      arango._create(collection, {}, type);
      console.log(`${collection} created with type ${type}`);
    }
  }
}

function createIndexes() {
  console.log("creating indexes ...");
  for (let index of indexes) {
    const coll = arango._collection(index.collection);
    console.log(`${index.fields} indexed in ${index.collection} collection`);
    delete index.collection;
    coll.ensureIndex(index);
  }
}

function removeDeprecatedCollections() {
  console.log("removing deprecated collections");
  for (let collection of deprecated) {
    const coll = arango._collection(collection);
    if (coll) {
      arango._drop(collection);
      console.log(`${collection} dropped`);
    } else {
      console.log(`${collection} dropped before`);
    }
  }
}

function initializeVariables() {
  console.log("initialize variables ...");
  for (let variable of variables) {
    if (!variablesColl.exists(variable._key)) {
      variablesColl.insert(variable);
    }
  }
}

function v6_8() {
  const connectionsHistoryColl = arango._collection("connectionsHistory");
  connectionsHistoryColl
    .all()
    .toArray()
    .forEach((conn) => {
      if (conn._from == conn._to) {
        connectionsHistoryColl.remove(conn);
      }
    });

  const connectionsColl = arango._collection("connections");
  connectionsColl
    .all()
    .toArray()
    .forEach((conn) => {
      if (conn._from == conn._to) {
        connectionsColl.remove(conn);
      }
    });
}

const upgrades = ["v6_8"];

function initdb() {
  createCollections();
  createIndexes();
  removeDeprecatedCollections();
  initializeVariables();
  let index;
  if (variablesColl.exists("LAST_DB_UPGRADE_V6")) {
    upgrade = variablesColl.document("LAST_DB_UPGRADE_V6").value;
    index = upgrades.indexOf(upgrade) + 1;
  } else {
    index = 0;
  }
  while (upgrades[index]) {
    eval(upgrades[index])();
    variablesColl.update("LAST_DB_UPGRADE_V6", { value: upgrades[index] });
    index += 1;
  }
}

initdb();
