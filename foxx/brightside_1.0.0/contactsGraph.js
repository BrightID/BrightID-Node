'use strict';

const aql = require('@arangodb').aql;
const db = require('@arangodb').db;
const errors = require('@arangodb').errors;

const connectionsColl = db._collection('connections');
const removedColl = db._collection('removed');

function b64ToSafeB64(s) {
  const alts = {
    '/': '_',
    '+': '-',
    '=': ''
  };
  return s.replace(/[/+=]/g, function (c) {
    return alts[c];
  });
}

function allEdges(collection, user1, user2) {
  return db._query(aql`
    for i in ${collection}
      filter (i._from == ${user1} && i._to == ${user2})
      || (i._from == ${user2} && i._to == ${user1})
    sort i.timestamp desc
    return { "key": i._key, "timestamp": i.timestamp }
  `);
}

function removeByKeys(collection, keys) {
  if (keys.length > 0) {
    db._query(aql`
      for i in ${collection}
        filter i._key in ${keys}
        remove i in ${collection}
    `);
  }
}

function updateAndClean(collection, key1, key2, timestamp) {
  // all keys in the DB are in the url/directory/db safe b64 format
  const user1 = 'users/' + b64ToSafeB64(key1);
  const user2 = 'users/' + b64ToSafeB64(key2);

  const added = allEdges(connectionsColl, user1, user2)._documents;
  const removed = allEdges(removedColl, user1, user2)._documents;

  // if this operation is newer than existing operations of either type
  if ((!added || !added.length || timestamp > added[0].timestamp)
    && (!removed || !removed.length || timestamp > removed[0].timestamp)) {
    db._query(aql`
      insert {
        _from: ${user1},
        _to: ${user2},
        timestamp: ${timestamp}
      } in ${collection}
    `);
    // remove any operation of either type older than the new one
    if (added && added.length) {
      removeByKeys(connectionsColl, added.map(entry => entry.key));
    }
    if (removed && removed.length) {
      removeByKeys(removedColl, removed.map(entry => entry.key));
    }
  }
}

const operations = {
  addAndClean: function addAndClean(key1, key2, timestamp) {
    updateAndClean(connectionsColl, key1, key2, timestamp);
  },
  removeAndClean: function removeAndClean(key1, key2, timestamp) {
    updateAndClean(removedColl, key1, key2, timestamp);
  }
};

module.exports = operations;