'use strict';

const { sha256 } = require('@arangodb/crypto');

const { query, db } = require('@arangodb');

const _ = require('lodash');

const connectionsColl = db._collection('connections');
const removedColl = db._collection('removed');
const groupsColl = db._collection('groups');
const newGroupsColl = db._collection('newGroups');
const usersInGroupsColl = db._collection('usersInGroups');
const usersInNewGroupsColl = db._collection('usersInNewGroups');
const usersColl = db._collection('users');
const contextsColl = db._collection('contexts');
const sponsorshipsColl = db._collection('sponsorships');
const operationsColl = db._collection('operations');

const {
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  urlSafeB64ToB64
} = require('./encoding');


function removeConnection(key1, key2, timestamp){
  const user1 = 'users/' + key1;
  const user2 = 'users/' + key2;
  query`
    for c in ${connectionsColl}
      filter (c._from == ${user1} && c._to == ${user2})
      || (c._from == ${user2} && c._to == ${user1})
      remove c in ${connectionsColl}
  `;
}

function addConnection(key1, key2, timestamp){
  const user1 = 'users/' + key1;
  const user2 = 'users/' + key2;
  const u1 = loadUser(key1);
  const u2 = loadUser(key2);
  // todo: we should prevent non-verified users from creating
  // new accounts by making connections.
  if (!u1) {
    createUser(key1);
  }
  if (!u2) {
    createUser(key2);
  }
  query`
    insert {
      _from: ${user1},
      _to: ${user2},
      timestamp: ${timestamp}
    } in ${connectionsColl}
  `;
}

function userConnectionsRaw(user){
  user = "users/" + user;
  return query`
      LET userConnections1 = (
        FOR c in ${connectionsColl}
          FILTER c._from == ${user}
          RETURN c._to
      )
      LET userConnections2 = (
        FOR c in ${connectionsColl}
          FILTER c._to == ${user}
          RETURN c._from
      )
      RETURN UNION_DISTINCT(userConnections1, userConnections2)
  `.toArray()[0]
}

function userConnections(user){
  return userConnectionsRaw(user).map(u => u.replace("users/", ""))
}

function loadUsers(users){
  return query`
      FOR u in ${usersColl}
        FILTER u._key in ${users}
          RETURN {
            id: u._key,
            score: u.score
          }
  `.toArray();
}

function groupMembers(groupId, isNew = false){
  let key, collection;
  if (isNew) {
    key = "newGroups/" + groupId;
    collection = usersInNewGroupsColl;
  } else {
    key = "groups/" + groupId;
    collection = usersInGroupsColl;
  }
  return query`
    for i in ${collection}
      filter i._to == ${key}
    return DISTINCT i._from
  `.toArray().map(m => m.replace("users/", ""));
}

function isEligible(groupId, userId){
  const userCons = userConnections(userId);
  const groupMems = groupMembers(groupId);
  const count = _.intersection(userCons, groupMems).length;

  return count * 2 > groupMems.length;
}

function userEligibleGroups(userId, connections, currentGroups = []){
  const user = "users/" + userId;
  const candidates = query`
      FOR edge in ${usersInGroupsColl}
          FILTER edge._from in ${connections}
          FILTER edge._to NOT IN ${currentGroups}
          COLLECT group=edge._to WITH COUNT INTO count
          FILTER count >= 2
          SORT count DESC
          RETURN {
              group,
              count
          }
  `.toArray();

  const groupIds = candidates.map(x => x.group);
  const groupCounts = query`
    FOR ug in ${usersInGroupsColl}
      FILTER ug._to in ${groupIds}
      COLLECT id=ug._to WITH COUNT INTO count
      return {
        id,
        count
      }
  `.toArray();

  const groupCountsDic = {};

  groupCounts.map(function(row){
    groupCountsDic[row.id] = row.count;
  });

  const eligibles = candidates
    .filter(g => g.count * 2 > groupCountsDic[g.group])
    .map(g => g.group);

  return loadGroups(eligibles, connections, userId);
}

function userNewGroups(userId, connections){
  const user = "users/" + userId;
  // FIXME: why connections and userId is being passed here to groupToDic?
  return query`
      FOR g in ${newGroupsColl}
        FILTER ${user} in g.founders
      return g
  `.toArray().map(g => groupToDic(g, connections, userId));
}

function userCurrentGroups(userId){
  const user = "users/" + userId;
  return query`
    FOR ug in ${usersInGroupsColl}
      FILTER ug._from == ${user}
      return DISTINCT ug._to
  `.toArray();
}

function groupToDic(group){
  let founders = [];
  let knownMembers;
  if (group.founders && group.founders.map){
    founders = group.founders.map(u => u.replace("users/", ""));
  }
  if (group.isNew) {
    // knownMembers for a new group is just the founders that have already joined
    knownMembers = groupMembers(group._key, group.isNew);
  } else {
    knownMembers = group.knownMembers.map(m => m.replace("users/", ""));
  }
  return {
    isNew: group.isNew,
    score: group.score,
    id: group._key,
    knownMembers,
    founders,
  };
}

function loadGroups(groupIds, connections, myUserId){
  const me = "users/" + myUserId;

  return query`
    FOR g in ${groupsColl}
      FILTER g._id in ${groupIds}
      LET members = (
        FOR m in usersInGroups
          FILTER m._to == g._id && m._from in ${connections}
          LIMIT 3
          RETURN DISTINCT m._from
      )
      LET me = (
        FOR m in usersInGroups
          FILTER m._to == g._id && m._from == ${me}
          LIMIT 1
          RETURN m._from
      )
      return MERGE([g, {"knownMembers": APPEND(members, me)}])
  `.toArray().map(g => groupToDic(g));
}

function loadUser(id){
  return query`RETURN DOCUMENT(${usersColl}, ${id})`.toArray()[0];
}

function userScore(key){
  return query`
    FOR u in ${usersColl}
      FILTER u._key  == ${key}
      RETURN u.score
  `.toArray()[0];
}

function updateEligibleTimestamp(key, timestamp){
  return query`
    UPDATE ${key} WITH {eligible_timestamp: ${timestamp}} in users
  `;
}


function createUser(key){
  // already exists?
  const user = loadUser(key);

  if (!user) {
    usersColl.save({
      score: 0,
      signingKey: urlSafeB64ToB64(key),
      _key: key
    });
  }
}

function createGroup(key1, key2, key3, timestamp){
  const user1 = 'users/' + key1;
  const user2 = 'users/' + key2;
  const user3 = 'users/' + key3;

  const founders = [user1, user2, user3].sort();

  function isDuplicate(collection){
    return query`
      for i in ${collection}
        filter (${user1} in i.founders && ${user2} in i.founders && ${user3} in i.founders )
        limit 1
      return 1
    `.count() > 0;
  }

  if (isDuplicate(newGroupsColl) || isDuplicate(groupsColl)) {
    throw 'Duplicate group';
  }

  const conns = userConnections(key1);

  if (conns.indexOf(key2) < 0 || conns.indexOf(key3) < 0) {
    throw "Creator isn't connected to one or both of the co-founders";
  }
  const h = sha256([key1, key2, key3].sort().join(','));
  const b = Buffer.from(h, 'hex').toString('base64');
  const groupId = b64ToUrlSafeB64(b);

  newGroupsColl.save({
    _key: groupId,
    score: 0,
    isNew: true,
    timestamp: timestamp,
    founders: founders
  });

  // Add the creator to the group now. The other two "co-founders" have to join using /membership
  addUserToGroup(usersInNewGroupsColl, groupId, key1, timestamp, "newGroups");
}

function addUserToGroup(collection, groupId, key, timestamp, groupCollName){
  const user = 'users/' + key;
  const group = groupCollName + '/' + groupId;

  return collection.save({
    timestamp: timestamp,
    _from: user,
    _to: group
  });
}

function deleteGroup(groupId, key, timestamp){

  const groups = query`
    for i in ${newGroupsColl}
      filter i._key == ${groupId}
    return i
  `.toArray();

  if (! groups || ! groups.length) {
    throw 'Group not found';
  }
  const group = groups[0];

  if (group.founders.indexOf('users/' + key) < 0) {
    throw 'Access Denied';
  }
  // Remove members

  const newGroup = "newGroups/" + groupId;
  query`
    for i in ${usersInNewGroupsColl}
      filter i._to == ${newGroup}
      remove i in ${usersInNewGroupsColl}
  `;

  // Remove group
  query`remove ${group._key} in ${newGroupsColl}`;
}

function addMembership(groupId, key, timestamp){
  let groups = query`
    for i in ${groupsColl}
      filter i._key == ${groupId}
    return i
  `.toArray();
  const user = "users/" + key;
  let isNew = false;
  if (! groups.length) {
    // load from newGroups
    isNew = true;
    groups = query`
      for i in ${newGroupsColl}
        filter i._key == ${groupId}
      return i
    `.toArray();
  }
  if (! groups.length) {
    throw 'Group not found';
  }
  const group = groups[0];
  if (isNew && group.founders.indexOf(user) < 0) {
    throw 'Access denied';
  }

  if (isNew) {
    addUserToGroup(usersInNewGroupsColl, groupId, key, timestamp, "newGroups");
    //move to groups if all founders joined
    const grp = "newGroups/" + groupId;
    const groupMembers = query`
      for i in ${usersInNewGroupsColl}
        filter i._to == ${grp}
        return i
    `.toArray();

    const memberIds = [...new Set(groupMembers.map(x => x._from))];

    if (memberIds.length == group.founders.length) {
      groupsColl.save({
        score: 0,
        isNew: false,
        timestamp: group.timestamp,
        founders: group.founders,
        _key: group._key
      });

      for (let i = 0; i < groupMembers.length; i++) {
        let doc = groupMembers[i];
        usersInGroupsColl.save({
          _from: doc._from,
          _to: doc._to.replace('newGroups', 'groups'),
          timestamp: doc.timestamp
        });
        query`remove ${doc._key} in ${usersInNewGroupsColl}`;
      }

      query`remove ${group._key} in ${newGroupsColl}`;
    }
  } else {
    if (isEligible(groupId, key)) {
      addUserToGroup(usersInGroupsColl, groupId, key, timestamp, "groups");
    } else {
      throw 'Not eligible to join this group';
    }
  }
}

function deleteMembership(groupId, key, timestamp){
  const user = "users/" + key;
  const group = "groups/" + groupId;

  query`
    for i in ${usersInGroupsColl}
      filter i._to == ${group} && i._from == ${user}
      remove i in ${usersInGroupsColl}
  `;
}

function getContext(context){
  return query`RETURN DOCUMENT(${contextsColl}, ${context})`.toArray()[0];
}

function latestVerificationByAccount(coll, account){
  return query`
    FOR m in ${coll}
      FILTER m.account == ${account}
      SORT m.timestamp DESC
      LIMIT 1
      RETURN m
  `.toArray()[0];
}

function latestVerificationById(coll, id){
  return query`
    FOR m in ${coll}
      FILTER m.user == ${id}
      SORT m.timestamp DESC
      LIMIT 1
      RETURN m
  `.toArray()[0];
}


function userHasVerification(verification, user){
  const u = loadUser(user);
  return u && u.verifications && u.verifications.indexOf(verification) > -1;
}

function linkAccount(coll, account, id, timestamp){
  // todo: is it required to prevent users to link account with old timestamp
  const v = latestVerificationById(coll, id);
  if (v && v.timestamp > timestamp) {
    throw "there was an existing linked account with a more recent timestamp";
  }
  query`
    upsert { user: ${id} }
    insert { user: ${id}, account: ${account}, timestamp: ${timestamp} }
    update { timestamp: ${timestamp}, account: ${account} } in ${coll}
  `;
}

function setTrusted(trusted, key, timestamp){
  const user = loadUser(key);
  if (user.trusted) {
    // TODO: users should be able to update their trusted connections
    // by providing sigs of 2 trusted connections approving that
    throw "trusted connections can't be overwritten";
  }

  query`
    UPDATE ${key} WITH {trusted: ${trusted}, updateTime: ${timestamp}} in users
  `;
}

function setSigningKey(signingKey, key, signers, timestamp){
  const user = loadUser(key);
  if (signers[0] == signers[1] ||
      !user.trusted.includes(signers[0]) ||
      !user.trusted.includes(signers[1])) {
    throw "request should be signed by 2 different trusted connections";
  }
  query`
    UPDATE ${key} WITH {signingKey: ${signingKey}, updateTime: ${timestamp}} in users
  `;
}

function verifyAccount(id, account, context, timestamp, sponsorshipSig){
  // check if user is sponsored before having verification
  // to not allow apps using sponsorship error as a proof that user is verified
  if (!isSponsored(id)) {
    if (!sponsorshipSig) {
      throw 'user is not sponsored';
    }
    if (unusedSponsorship(context) < 1) {
      throw "context does not have unused sponsorships";
    }
  }

  const { verification, collection } = getContext(context);
  if (!userHasVerification(verification, id)) {
    throw 'user can not be verified for this context';
  }

  // call sponsor after checking if user has verification to not waste
  // sponsorships of the context for fake users
  if (!isSponsored(id) && sponsorshipSig) {
    sponsor(id, context);
  }

  // update the account and timestamp and mark it as current in the db
  const coll = db._collection(collection);
  linkAccount(coll, account, id, timestamp);
}

function isSponsored(key){
  return sponsorshipsColl.firstExample({ '_from': 'users/' + key }) != null;
}

function unusedSponsorship(context){
  const usedSponsorships = query`
    FOR s in ${sponsorshipsColl}
      FILTER s._to == ${'contexts/' + context}
      RETURN s
  `.count();
  const { totalSponsorships } = getContext(context);
  return totalSponsorships - usedSponsorships;
}

function sponsor(key, context){
  sponsorshipsColl.save({
    _from: 'users/' + key,
    _to: 'contexts/' + context
  });
}

function upsertOperation(op) {
  if (!operationsColl.exists(op)) {
    operationsColl.insert(op); 
  } else {
    operationsColl.replace(op['_key'], op);
  }
}

module.exports = {
  addConnection,
  removeConnection,
  createGroup,
  deleteGroup,
  addMembership,
  deleteMembership,
  userEligibleGroups,
  userCurrentGroups,
  loadUser,
  loadGroups,
  updateEligibleTimestamp,
  userNewGroups,
  createUser,
  groupMembers,
  userConnections,
  userConnectionsRaw,
  userScore,
  loadUsers,
  getContext,
  userHasVerification,
  latestVerificationByAccount,
  latestVerificationById,
  sponsor,
  verifyAccount,
  linkAccount,
  upsertOperation,
  setTrusted,
  setSigningKey,
};
