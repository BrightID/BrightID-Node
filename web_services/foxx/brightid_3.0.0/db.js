'use strict';

const { sha256 } = require('@arangodb/crypto');

const { query, db } = require('@arangodb');

const _ = require('lodash');

const connectionsColl = db._collection('connections');
const groupsColl = db._collection('groups');
const newGroupsColl = db._collection('newGroups');
const usersInGroupsColl = db._collection('usersInGroups');
const usersInNewGroupsColl = db._collection('usersInNewGroups');
const usersColl = db._collection('users');
const contextsColl = db._collection('contexts');
const sponsorshipsColl = db._collection('sponsorships');
const operationsColl = db._collection('operations');
const invitationsColl = db._collection('invitations');

const {
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  urlSafeB64ToB64
} = require('./encoding');

function getConnection(key1, key2) {
  let conn = connectionsColl.firstExample({
    _from: 'users/' + key1,
    _to: 'users/' + key2
  });
  if (! conn) {
    conn = connectionsColl.firstExample({
      _from: 'users/' + key2,
      _to: 'users/' + key1
    });
  }
  return conn;
}

function addConnection(key1, key2, timestamp){
  // create user by adding connection if it's not created
  // todo: we should prevent non-verified users from creating new users by making connections.
  const u1 = loadUser(key1);
  const u2 = loadUser(key2);
  if (!u1) {
    createUser(key1, timestamp);
  }
  if (!u2) {
    createUser(key2, timestamp);
  }

  // remove flag if exists
  if (u1 && u1.flaggers && key2 in u1.flaggers) {
    delete u1.flaggers[key2];
    usersColl.update(u1, { flaggers: u1.flaggers }, { mergeObjects: false });
  }
  if (u2 && u2.flaggers && key1 in u2.flaggers) {
    delete u2.flaggers[key1];
    usersColl.update(u2, { flaggers: u2.flaggers }, { mergeObjects: false });
  }

  const conn = getConnection(key1, key2);
  if (! conn) {
    connectionsColl.save({
      _from: 'users/' + key1,
      _to: 'users/' + key2,
      timestamp
    });
  } else {
    connectionsColl.update(conn, { timestamp });
  }
}

function removeConnection(flagger, flagged, reason, timestamp){
  if (! ['fake', 'duplicate', 'deceased'].includes(reason)) {
    throw 'invalid reason';
  }
  const conn = getConnection(flagger, flagged);
  if (! conn) {
    throw 'no connection found';
  }

  connectionsColl.remove(conn);
  
  // add flagger to the flaggers on the flagged user
  const flaggedUser = usersColl.document(flagged);
  let flaggers = flaggedUser.flaggers;
  if (! flaggers) {
    flaggers = {}
  }
  flaggers[flagger] = reason;
  usersColl.update(flaggedUser, { flaggers });

  // remove the flaged user from all groups that two or more members of them
  // flagged that user
  const edges = usersInGroupsColl.byExample({ _from: 'users/' + flagged }).toArray();
  edges.map(edge => {
    const edges2 = usersInGroupsColl.byExample({ _to: edge._to }).toArray();
    const members = edges2.map(edge2 => edge2._from.replace('users/', ''));
    const intersection = Object.keys(flaggers).filter(u => members.includes(u));
    if (intersection.length >= 2) {
      usersInGroupsColl.remove(edge);
    }
  });
}

function userConnections(user){
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
  `.toArray()[0].map(u => u.replace("users/", ""))
}

function loadUsers(users){
  return query`
      FOR u in ${usersColl}
        FILTER u._key in ${users}
          RETURN {
            id: u._key,
            score: u.score,
            createdAt: u.createdAt,
            flaggers: u.flaggers,
            eligible_groups: u.eligible_groups
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

function updateEligibleGroups(userId, connections, currentGroups){
  connections = connections.map(uId => 'users/' + uId);
  currentGroups = currentGroups.map(gId => 'groups/' + gId);
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

  const eligible_groups = candidates
    .filter(g => g.count * 2 > groupCountsDic[g.group])
    .map(g => g.group.replace('groups/', ''));
  usersColl.update(userId, {
    eligible_groups,
    eligible_timestamp: Date.now()
  });
  return eligible_groups;
}

function groupToDic(group){
  group.members = groupMembers(group._key, group.isNew);
  group.id = group._key;
  return group;
}

function userNewGroups(userId){
  return query`
      FOR g in ${newGroupsColl}
        FILTER ${userId} in g.founders
      return g
  `.toArray().map(groupToDic);
}

function userCurrentGroups(userId){
  const user = "users/" + userId;
  return query`
    FOR ug in ${usersInGroupsColl}
      FILTER ug._from == ${user}
      return DISTINCT ug._to
  `.toArray().map(gId => groupsColl.document(gId)).map(groupToDic);
}

function userInvitedGroups(userId){
  return invitationsColl.byExample({
    _from: 'users/' + userId
  }).toArray().map(invite => {
    const group = groupsColl.document(invite._to);
    group.inviter = invite.inviter;
    return groupToDic(group);
  });
}

function invite(inviter, invitee, groupId, timestamp){
  if (! groupsColl.exists(groupId)) {
    throw 'invalid group id';
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(inviter)) {
    throw 'inviter is not admin of group';
  }
  if (! isEligible(groupId, invitee)) {
    throw 'invitee is not eligible to join this group';
  }
  if (group.type == 'primary' && hasPrimaryGroup(invitee)) {
    throw 'user already has a primary group';
  }

  invitationsColl.insert({
    _from: 'users/' + invitee,
    _to: 'groups/' + groupId,
    inviter,
    timestamp
  });
}

function dismiss(dismisser, dismissee, groupId, timestamp){
  if (! groupsColl.exists(groupId)) {
    throw 'invalid group id';
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(dismisser)) {
    throw 'dismisser is not admin of group';
  }
  if (group.admins.includes(dismissee)) {
    throw 'admins can not be dismissed from group';
  }
  if (! groupMembers(groupId).includes(dismissee)) {
    throw 'dismissee is not member of group';
  }

  usersInGroupsColl.removeByExample({
    _from: 'users/' + dismissee,
    _to: 'groups/' + groupId,
  });
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

function createUser(key, timestamp){
  // already exists?
  const user = loadUser(key);

  if (!user) {
    usersColl.save({
      score: 0,
      signingKey: urlSafeB64ToB64(key),
      createdAt: timestamp,
      _key: key
    });
  }
}

function hasPrimaryGroup(key){
  const groupIds = usersInGroupsColl.byExample({
    _from: 'users/' + key
  }).toArray().map(ug => ug._to.replace('groups/', ''));
  const groups = groupsColl.documents(groupIds).documents;
  return groups.filter(group => group.type == 'primary').length > 0;
}

function createGroup(key1, key2, key3, type, timestamp){
  if (! ['general', 'primary'].includes(type)) {
    throw 'invalid type';
  }

  const founders = [key1, key2, key3].sort()
  const h = sha256(founders.join(','));
  const b = Buffer.from(h, 'hex').toString('base64');
  const groupId = b64ToUrlSafeB64(b);
  if (newGroupsColl.exists(groupId) || groupsColl.exists(groupId)) {
    throw 'duplicate group';
  }

  const conns = userConnections(key1);
  if (conns.indexOf(key2) < 0 || conns.indexOf(key3) < 0) {
    throw "Creator isn't connected to one or both of the co-founders";
  }

  if (type == 'primary' && founders.some(hasPrimaryGroup)) {
    throw 'some of founders already have primary groups';
  }

  newGroupsColl.save({
    _key: groupId,
    score: 0,
    isNew: true,
    type,
    timestamp,
    founders
  });

  // Add the creator to the group now. The other two "co-founders" have to join using /membership
  addUserToGroup(usersInNewGroupsColl, groupId, key1, timestamp, "newGroups");
  return groupId;
}

function addAdmin(key, admin, groupId){
  if (! groupsColl.exists(groupId)) {
    throw 'group not found';
  }
  if (! usersInGroupsColl.firstExample({
    _from: 'users/' + admin,
    _to: 'groups/' + groupId
  })) {
    throw 'new admin is not member of the group';
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(key)) {
    throw 'only admins can add new admins';
  }
  group.admins.push(admin);
  groupsColl.update(group, { admins: group.admins });
}

function addUserToGroup(collection, groupId, key, timestamp, groupCollName){
  const user = 'users/' + key;
  const group = groupCollName + '/' + groupId;

  // flagged users can't join a group that have 2 or more flaggers in them
  const flaggers = usersColl.document(key).flaggers;
  if (flaggers) {
    const members = collection.byExample({ _to: group }).toArray().map(e => e._from.replace('users/', ''));
    const intersection = Object.keys(flaggers).filter(u => members.includes(u));
    if (intersection.length >= 2) {
      throw 'user is flagged by two or more members of the group';
    }
  }

  const edge = collection.firstExample({
    _from: user,
    _to: group
  });
  if (! edge) {
    collection.save({
      _from: user,
      _to: group,
      timestamp
    });
  } else {
    collection.update(edge, { timestamp });
  }

}

function addMembership(groupId, key, timestamp){
  let group, isNew;
  if (groupsColl.exists(groupId)) {
    group = groupsColl.document(groupId);
    isNew = false;
  } else if (newGroupsColl.exists(groupId)) {
    group = newGroupsColl.document(groupId);
    isNew = true;
  } else {
    throw 'Group not found';
  }
  if (isNew && ! group.founders.includes(key)) {
    throw 'Access denied';
  }

  if (group.type == 'primary' && hasPrimaryGroup(key)) {
    throw 'user already has a primary group';
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
        admins: group.founders,
        type: group.type,
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
    if (! isEligible(groupId, key)) {
      throw 'Not eligible to join this group';
    }
    if (inviteOnly(group)) {
      const invitation = invitationsColl.firstExample({
        _from: 'users/' + key,
        _to: 'groups/' + groupId
      });
      // invitations will expire after 24 hours
      if (!invitation || timestamp - invitation.timestamp >= 86400000) {
        throw 'not invited to join this group';
      }
      // remove invitation after joining to not allow reusing that
      invitationsColl.remove(invitation);
    }
    addUserToGroup(usersInGroupsColl, groupId, key, timestamp, "groups");
  }
}

function inviteOnly(group){
  return true;
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

  if (group.founders.indexOf(key) < 0) {
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

function deleteMembership(groupId, key, timestamp){
  if (! groupsColl.exists(groupId)) {
    throw 'group not found';
  }
  usersInGroupsColl.removeByExample({
    _from: "users/" + key,
    _to: "groups/" + groupId,
  });
  const group = groupsColl.document(groupId);
  if (group.admins && group.admins.includes(key)) {
    const admins = group.admins.filter(admin => key != admin);
    groupsColl.update(group, { admins });
  }
}

function getContext(context){
  return query`RETURN DOCUMENT(${contextsColl}, ${context})`.toArray()[0];
}

function getUserByContextId(coll, contextId){
  return query`
    FOR l in ${coll}
      FILTER l.contextId == ${contextId}
      RETURN l.user
  `.toArray()[0];
}

function getContextIdsByUser(coll, id){
  return query`
    FOR u in ${coll}
      FILTER u.user == ${id}
      SORT u.timestamp DESC
      RETURN u.contextId
  `.toArray();
}

function getLastContextIds(coll, verification){
  return query`
    FOR c IN ${coll}
      FOR u in ${usersColl}
        FILTER c.user == u._key
        FILTER ${verification} in u.verifications
        SORT c.timestamp DESC
        COLLECT user = c.user INTO contextIds = c.contextId
        RETURN contextIds[0]
  `.toArray();
}

function userHasVerification(verification, user){
  const u = loadUser(user);
  return u && u.verifications && u.verifications.indexOf(verification) > -1;
}

function linkContextId(id, context, contextId, timestamp){
  const { collection } = getContext(context);
  const coll = db._collection(collection);

  if (getUserByContextId(coll, contextId)) {
    throw 'contextId is duplicate';
  }

  query`
    insert {
      user: ${id},
      contextId: ${contextId},
      timestamp: ${timestamp}
    } in ${coll}
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

function sponsor(contextId, context){
  const { collection } = getContext(context);
  const coll = db._collection(collection);
  const user = getUserByContextId(coll, contextId)

  if (unusedSponsorship(context) < 1) {
    throw "context does not have unused sponsorships";
  }

  if (isSponsored(user)) {
    throw "sponsored before";
  }

  sponsorshipsColl.save({
    _from: 'users/' + user,
    _to: 'contexts/' + context
  });
}

function loadOperation(key) {
  return query`RETURN DOCUMENT(${operationsColl}, ${key})`.toArray()[0];
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
  addAdmin,
  addMembership,
  deleteMembership,
  updateEligibleGroups,
  invite,
  dismiss,
  userCurrentGroups,
  loadUser,
  userNewGroups,
  userInvitedGroups,
  createUser,
  groupMembers,
  userConnections,
  userScore,
  loadUsers,
  getContext,
  userHasVerification,
  getUserByContextId,
  getContextIdsByUser,
  sponsor,
  isSponsored,
  linkContextId,
  loadOperation,
  upsertOperation,
  setTrusted,
  setSigningKey,
  getLastContextIds,
  unusedSponsorship
};
