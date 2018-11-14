'use strict';

const aql = require('@arangodb').aql;
const db = require('@arangodb').db;
const errors = require('@arangodb').errors;

const _ = require('lodash');

const connectionsColl = db._collection('connections');
const removedColl = db._collection('removed');
const groupsColl = db._collection('groups');
const newGroupsColl = db._collection('newGroups');

const usersInGroupsColl = db._collection('usersInGroups');
const usersInNewGroupsColl = db._collection('usersInNewGroups');

const usersColl = db._collection('users');

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

function userConnections(user){
  return db._query(aql`
    for i in ${connectionsColl}
      filter i._from == ${user}
    sort i.timestamp desc
    return i
  `).toArray(); 
}

function groupMembers(group){
  return db._query(aql`
    for i in ${usersInGroupsColl}
      filter i._to == ${group}
    return i
  `).toArray();
}

function isEligible(groupId, userId){
  const userCons = userConnections("users/"+b64ToSafeB64(userId)).map(x => x._to);
  const groupMems = groupMembers("groups/"+groupId).map(x => x._from);
  const count = _.intersection(userCons, groupMems).length;
    
  if(count*2 > groupMems){
    return true;
  }
  return false;
}

function userEligibleGroups(userId){
  const user = "users/" + b64ToSafeB64(userId);
  const candidates = db._query(aql`
      LET userConnections = (
        FOR c in connections
          FILTER c._from == ${user}
          RETURN c._to
      )
      FOR edge in usersInGroups
          FILTER edge._from in userConnections
          COLLECT group=edge._to  WITH COUNT INTO count
          FILTER count >= 2
          SORT count DESC
          RETURN {
              group,
              count
          }
  `).toArray();

  var groupIds = candidates.map(x => x.group);
  const groupCounts = db._query(aql`
    FOR ug in usersInGroups
      FILTER ug._to in ${groupIds}
      COLLECT id=ug._to WITH COUNT INTO count
      return {
        id,
        count
      }
  `).toArray();

  var groupCountsDic = {};
  groupCounts.map(function(row){
    groupCountsDic[row.id] = row.count;
  });

  var eligibles = candidates.filter(function(g){
    if(g.count*2 > groupCountsDic[g.id]){
      return true;
    }
    return false;
  });
  eligibles = eligibles.map(x => x.id);
  return eligibles;
}

function userNewGroups(userId){
  const user = "users/" + b64ToSafeB64(userId);
  const groups = db._query(aql`
      FOR g in newGroups
        FILTER ${user} in g.founders
      return g
  `).toArray().map(g => groupToDic(g));
  return groups;
}

function userCurrentGroups(userId){
  const user = "users/"+b64ToSafeB64(userId);
  const groupIds = db._query(aql`
    FOR ug in usersInGroups
      FILTER ug._from == ${user}
      return ug._to
  `).toArray();
  return loadGroups(groupIds);
}

function groupToDic(g){
  return {
      isNew: g.isNew,
      score: g.score,
      id: g._key,
      knownMembers: [] //TODO: Ivan: load known members
    };
}

function loadGroups(ids){
  return db._query(aql`
    FOR g in groups
      FILTER g._id in ${ids}
      return g
  `).toArray().map(g => groupToDic(g));
}

function loadUser(id){
  var user = "users/"+b64ToSafeB64(id);
  return db._query(aql`RETURN DOCUMENT(${user})`).toArray()[0];
}

function updateEligibleTimestamp(key, timestamp){
  return db._query(aql`
    UPDATE ${key} WITH {eligible_timestamp: ${timestamp}} in users
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

function createUser(key){
  const ret = usersColl.save({
    score: 0,
    _key: b64ToSafeB64(key)
  });
  return {
    key: ret._key,
    score: 0
  };
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

  // Ivan: Is this a safe method for avoiding duplicate edges
  // or parallel requests can push more than one edge to db?
  const ret = db._query(aql`
    FOR i in ${collection}
      FILTER i._from == ${user} && i._to == ${group}
      RETURN i
  `).toArray();

  if(ret && ret.length){
    return ret[0];
  }

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
    //move to groups if all founders joined
    const groupMembers = db._query(aql`
      for i in ${usersInNewGroupsColl}
        return i
    `).toArray()

    if(groupMembers.length == group.founders.length){
      groupsColl.save({
        score: 0,
        isNew: false,
        timestamp: group.timestamp,
        founders: group.founders,
        _key: group._key
      });

      for(var i=0; i < groupMembers.length; i++){
        var doc = groupMembers[i];
        usersInGroupsColl.save({
          _key: doc._key,
          _from: doc._from,
          _to: doc._to.replace('newGroups', 'groups'),
          timestamp: doc.timestamp
        });
        db._query(aql`remove ${doc._key} in ${usersInNewGroupsColl}`);
      }

      db._query(aql`remove ${group._key} in ${newGroupsColl}`);
    }
  }else{
    if(isEligible(groupId, key)){
      addUserToGroup(usersInGroupsColl, groupId, key, timestamp, "groups");  
    }else{
      throw 'Not eligible to join this group';
    }
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
    return deleteMembership(usersInGroupsColl, group, key, timestamp);
  },
  userEligibleGroups: userEligibleGroups,
  loadGroups: loadGroups,
  userCurrentGroups: userCurrentGroups,
  loadUser: loadUser,
  updateEligibleTimestamp: updateEligibleTimestamp,
  userNewGroups: userNewGroups,
  createUser: createUser
};

module.exports = operations;