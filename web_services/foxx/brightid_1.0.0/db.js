'use strict';

const aql = require('@arangodb').aql;
const db = require('@arangodb').db;
const errors = require('@arangodb').errors;

const connectionsColl = db._collection('connections');
const removedColl = db._collection('removed');
const groupsColl = db._collection('groups');
const newGroupsColl = db._collection('newGroups');

const usersInGroupsColl = db._collection('usersInGroups');
const usersInNewGroupsColl = db._collection('usersInNewGroups');

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
  db._query(aql`
    for i in ${collection}
      filter i._key in ${keys}
      remove i in ${collection}
  `);
}

function updateAndCleanConnections(collection, key1, key2, timestamp) {
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

function createGroup(collection, key1, key2, key3, timestamp){
  const user1 = 'users/' + b64ToSafeB64(key1);
  const user2 = 'users/' + b64ToSafeB64(key2);
  const user3 = 'users/' + b64ToSafeB64(key3);

  const founders = [user1, user2, user3].sort();

  // check duplicates
  const groups = db._query(aql`
    for i in ${collection}
      filter (${user1} in i.founders && ${user2} in i.founders && ${user3} in i.founders )
    return i
  `)._documents;

  if(groups.length){
    throw 'Duplicate group';
  }

  const ret = collection.save({
        score: 0,
        isNew: true,
        timestamp: timestamp,
        founders: founders
  });
  addUserToGroup(usersInNewGroupsColl, ret._key, key1, timestamp, "newGroups");
  return ret;
}

function addUserToGroup(collection, groupId, key, timestamp, groupCollName){
  const user = 'users/' + b64ToSafeB64(key);
  const group = groupCollName + '/' + groupId;

  //TODO: Ivan: check duplicate

  return collection.save({
    timestamp: timestamp,
    _from: user,
    _to: group
  });
}

function deleteGroup(collection, groupId, key, timestamp){
  const groups = db._query(aql`
    for i in ${collection}
      filter i._key == ${groupId}
    return i
  `).toArray();

  if(!groups || !groups.length){
    throw 'Group not found';
  }
  const group = groups[0];

  if(group.founders.indexOf('users/' + b64ToSafeB64(key)) < 0){
    throw 'Access Denied';
  }
  // Remove members

  const newGroup = "newGroups/"+groupId;
  db._query(aql`
    for i in ${usersInNewGroupsColl}
      filter i._to == ${newGroup}
      remove i in ${usersInNewGroupsColl}
  `);

  // Remove group
  db._query(aql`remove ${group._key} in ${collection}`);
}

function addMembership(groupId, key, timestamp){
  var groups =  db._query(aql`
    for i in ${groupsColl}
      filter i._key == ${groupId}
    return i
  `).toArray();
  const user = "users/" + b64ToSafeB64(key);
  var isNew = false;
  if(!groups.length){
    // load from newGroups
    isNew = true;
    groups = db._query(aql`
      for i in ${newGroupsColl}
        filter i._key == ${groupId}
      return i
    `).toArray();
  }
  if(!groups.length){
    throw 'Group not found';
  }
  const group = groups[0];
  if(isNew && group.founders.indexOf(user) < 0){
    throw 'Access denied';
  }

  if(isNew){
    addUserToGroup(usersInNewGroupsColl, groupId, key, timestamp, "newGroups");
    //TODO: Ivan: move to groups if all founders joined
  }else{
    //TODO: Ivan: is eligible?
    addUserToGroup(usersInGroups, groupId, key, timestamp, "groups");
  }
}

function deleteMembership(collection, groupId, key, timestamp){
  const user = "users/" + b64ToSafeB64(key);
  const group = "groups/"+groupId;

  db._query(aql`
    for i in ${collection}
      filter i._to == ${group} && i._from == ${user}
      remove i in ${collection}
  `);
}

const operations = {
  addConnection: function addAndClean(key1, key2, timestamp) {
    updateAndCleanConnections(connectionsColl, key1, key2, timestamp);
  },
  removeConnection: function removeAndClean(key1, key2, timestamp) {
    updateAndCleanConnections(removedColl, key1, key2, timestamp);
  },
  createGroup: function(key1, key2, key3, timestamp){
    return createGroup(newGroupsColl, key1, key2, key3, timestamp);
  },
  deleteGroup: function(group, key, timestamp){
    return deleteGroup(newGroupsColl, group, key, timestamp);
  },
  addMembership: function(group, key, timestamp){
    return addMembership(group, key, timestamp);
  },
  deleteMembership: function(group, key, timestamp){
    return deleteMembership(usersInGroups, group, key, timestamp);
  },
};

module.exports = operations;