'use strict';

const { sha256 } = require('@arangodb/crypto');

const { query, db } = require('@arangodb');

const _ = require('lodash');
const connectionsColl = db._collection('connections');
const connectionsHistoryColl = db._collection('connectionsHistory');
const groupsColl = db._collection('groups');
const usersInGroupsColl = db._collection('usersInGroups');
const usersColl = db._collection('users');
const contextsColl = db._collection('contexts');
const appsColl = db._collection('apps');
const sponsorshipsColl = db._collection('sponsorships');
const operationsColl = db._collection('operations');
const invitationsColl = db._collection('invitations');
const verificationsColl = db._collection('verifications');
const variablesColl = db._collection('variables');
const testblocksColl = db._collection('testblocks');

const {
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  urlSafeB64ToB64
} = require('./encoding');

function addConnection(key1, key2, timestamp) {
  // this function is deprecated and will be removed on v6
  connect({id1: key1, id2: key2, timestamp});
  connect({id1: key2, id2: key1, timestamp});
}

function connect(op) {
  let {
    id1: key1,
    id2: key2,
    level,
    reportReason,
    replacedWith,
    requestProof,
    timestamp
  } = op;
  // create user by adding connection if it's not created
  // todo: we should prevent non-verified users from creating new users by making connections.
  let u1 = loadUser(key1);
  let u2 = loadUser(key2);
  if (!u1) {
    u1 = createUser(key1, timestamp);
  }
  if (!u2) {
    u2 = createUser(key2, timestamp);
  }

  // set the first verified user that connect to a user as its parent
  let verifications = userVerifications(key1);
  if (!u2.parent && (verifications.map(v => v.name).includes('BrightID'))) {
    usersColl.update(u2, { parent: key1 });
  }

  const _from = 'users/' + key1;
  const _to = 'users/' + key2;
  const conn = connectionsColl.firstExample({ _from, _to });

  if (level != 'reported') {
    // clear reportReason for levels other than reported
    reportReason = null;
  }
  if (level != 'reported' || reportReason != 'replaced') {
    // clear replacedWith for levels other than reported
    // and reportReason other than replaced
    replacedWith = null;
  }
  if (replacedWith && ! loadUser(replacedWith)) {
    throw 'the new brightid replaced with the reported brightid not found';
  }
  if (! level) {
    // Set 'just met' as confidence level when old addConnection is called
    // and there was no other level set directly using Connect
    // this if should be removed when v5 dropped and "Add Connection" operation removed
    level = conn ? conn.level : 'just met';
  }

  connectionsHistoryColl.insert({ _from, _to, level, reportReason, replacedWith, requestProof, timestamp });

  if (! conn) {
    connectionsColl.insert({ _from, _to, level, reportReason, replacedWith, requestProof, timestamp });
  } else {
    connectionsColl.update(conn, { level, reportReason, replacedWith, requestProof, timestamp });
  }
}

function removeConnection(reporter, reported, reportReason, timestamp) {
  // this function is deprecated and will be removed on v6
  connect({
    id1: reporter,
    id2: reported,
    level: 'reported',
    reportReason,
    timestamp
  });
}

function userConnections(userId, direction = 'outbound') {
  let query, resIdAttr;
  if (direction == 'outbound') {
    query = { _from: 'users/' + userId };
    resIdAttr = '_to';
  } else {
    query = { _to: 'users/' + userId };
    resIdAttr = '_from';
  }
  return connectionsColl.byExample(query).toArray().map(conn => {
    return {
      id: conn[resIdAttr].replace('users/', ''),
      level: conn.level,
      reportReason: conn.reportReason || undefined,
      timestamp: conn.timestamp
    }
  });
}

function userToDic(userId) {
  const u = usersColl.document('users/' + userId);
  return {
    id: u._key,
    signingKey: u.signingKey,
    // score is deprecated and will be removed on v6
    score: u.score,
    verifications: userVerifications(u._key).map(v => v.name),
    hasPrimaryGroup: hasPrimaryGroup(u._key),
    // trusted is deprecated and will be replaced by recoveryConnections on v6
    trusted: getRecoveryConnections(u._key),
    // flaggers is deprecated and will be replaced by reporters on v6
    flaggers: getReporters(u._key),
    createdAt: u.createdAt,
    // eligible_groups is deprecated and will be replaced by eligibleGroups on v6
    eligible_groups: u.eligible_groups || []
  }
}

function getReporters(user) {
  const reporters = {};
  connectionsColl.byExample({
    _to: 'users/' + user,
    level: 'reported'
  }).toArray().forEach(c => {
    reporters[c._from.replace('users/', '')] = c.reportReason;
  });
  return reporters;
}

function groupMembers(groupId) {
  return usersInGroupsColl.byExample({
    _to: "groups/" + groupId,
  }).toArray().map(e => e._from.replace('users/', ''));
}

function isEligible(groupId, userId) {
  const conns = connectionsColl.byExample({
    _to: 'users/' + userId
  }).toArray().map(u => u._from.replace("users/", ""));
  const members = groupMembers(groupId);
  const count = _.intersection(conns, members).length;
  return count >= members.length / 2;
}

// storing eligible groups on users documents and updating them
// from this route will be removed when clients updated to use
// new GET /groups/{id} result to show eligibles in invite list
function updateEligibleGroups(userId, connections, currentGroups) {
  connections = connections.map(uId => 'users/' + uId);
  currentGroups = currentGroups.map(gId => 'groups/' + gId);
  const user = "users/" + userId;
  const candidates = query`
      FOR edge in ${usersInGroupsColl}
          FILTER edge._from in ${connections}
          FILTER edge._to NOT IN ${currentGroups}
          COLLECT group=edge._to WITH COUNT INTO count
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

  groupCounts.map(function(row) {
    groupCountsDic[row.id] = row.count;
  });

  const eligible_groups = candidates
    .filter(g => g.count * 2 >= groupCountsDic[g.group])
    .map(g => g.group.replace('groups/', ''));
  usersColl.update(userId, {
    eligible_groups,
    eligible_timestamp: Date.now()
  });
  return eligible_groups;
}

function updateEligibles(groupId) {
  const members = groupMembers(groupId);
  const neighbors = [];
  const isKnown = c => ['just met', 'already known', 'recovery'].includes(c.level);

  members.forEach(member => {
    const conns = connectionsColl.byExample({
      _from: 'users/' + member
    }).toArray().filter(isKnown).map(
      c => c._to.replace("users/", "")
    ).filter(u => !members.includes(u));
    neighbors.push(...conns);
  });

  const counts = {};
  for (let neighbor of neighbors) {
    counts[neighbor] = (counts[neighbor] || 0) + 1;
  }
  const eligibles = Object.keys(counts).filter(neighbor => {
    return counts[neighbor] >= members.length / 2;
  });
  // storing eligible groups on users documents and updating them
  // from this route will be removed when clients updated to use
  // new GET /groups/{id} result to show eligibles in invite list
  eligibles.forEach(neighbor => {
    let { eligible_groups } = usersColl.document(neighbor);
    eligible_groups = eligible_groups || [];
    if (eligible_groups.indexOf(groupId) == -1) {
      eligible_groups.push(groupId);
      usersColl.update(neighbor, {
        eligible_groups
      });
    }
  });
  return eligibles;
}

function groupToDic(groupId) {
  const group = groupsColl.document('groups/' + groupId);
  return {
    id: group._key,
    members: groupMembers(group._key),
    type: group.type || 'general',
    founders: group.founders.map(founder => founder.replace('users/', '')),
    admins: group.admins || group.founders,
    isNew: group.isNew,
    // score on group is deprecated and will be removed on v6
    score: 0,
    url: group.url,
    timestamp: group.timestamp,
  }
}

function userGroups(userId) {
  return usersInGroupsColl.byExample({
    _from: 'users/' + userId
  }).toArray().map( ug => {
    return {
      id: ug._to.replace('groups/', ''),
      timestamp: ug.timestamp
    }
  });
}

function userInvitedGroups(userId) {
  return invitationsColl.byExample({
    _from: 'users/' + userId
  }).toArray().filter(invite => {
    return Date.now() - invite.timestamp < 86400000
  }).map(invite => {
    let group = groupToDic(invite._to.replace('groups/', ''));
    group.inviter = invite.inviter;
    group.inviteId = invite._key;
    group.data = invite.data;
    group.invited = invite.timestamp;
    return group;
  });
}

function invite(inviter, invitee, groupId, data, timestamp) {
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
  if (group.isNew && ! group.founders.includes(invitee)) {
    throw 'new members can not be invited before founders join the group'
  }
  invitationsColl.removeByExample({
    _from: 'users/' + invitee,
    _to: 'groups/' + groupId
  });
  invitationsColl.insert({
    _from: 'users/' + invitee,
    _to: 'groups/' + groupId,
    inviter,
    data,
    timestamp
  });
}

function dismiss(dismisser, dismissee, groupId, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw 'invalid group id';
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(dismisser)) {
    throw 'dismisser is not admin of group';
  }
  deleteMembership(groupId, dismissee, timestamp);
}

function loadUser(id) {
  return query`RETURN DOCUMENT(${usersColl}, ${id})`.toArray()[0];
}

function userScore(key) {
  return query`
    FOR u in ${usersColl}
      FILTER u._key  == ${key}
      RETURN u.score
  `.toArray()[0];
}

function createUser(key, timestamp) {
  // already exists?
  const user = loadUser(key);

  if (!user) {
    return usersColl.insert({
      score: 0,
      signingKey: urlSafeB64ToB64(key),
      createdAt: timestamp,
      _key: key
    });
  } else {
    return user;
  }
}

function hasPrimaryGroup(key) {
  const groupIds = usersInGroupsColl.byExample({
    _from: 'users/' + key
  }).toArray().map(ug => ug._to.replace('groups/', ''));
  const groups = groupsColl.documents(groupIds).documents;
  return groups.filter(group => group.type == 'primary').length > 0;
}

function createGroup(groupId, key1, key2, inviteData2, key3, inviteData3, url, type, timestamp) {
  if (! ['general', 'primary'].includes(type)) {
    throw 'invalid type';
  }

  if (groupsColl.exists(groupId)) {
    throw 'duplicate group';
  }

  const conns = connectionsColl.byExample({
    _to: 'users/' + key1
  }).toArray().map(u => u._from.replace("users/", ""));
  if (conns.indexOf(key2) < 0 || conns.indexOf(key3) < 0) {
    throw "One or both of the co-founders are not connected to the founder!";
  }

  const founders = [key1, key2, key3].sort()
  if (type == 'primary' && founders.some(hasPrimaryGroup)) {
    throw 'some of founders already have primary groups';
  }

  groupsColl.insert({
    _key: groupId,
    score: 0,
    isNew: true,
    admins: founders,
    url,
    type,
    timestamp,
    founders
  });

  // Add the creator and invite other cofounders to the group now.
  // The other two "co-founders" have to join using /membership
  addUserToGroup(groupId, key1, timestamp);
  invite(key1, key2, groupId, inviteData2, timestamp);
  invite(key1, key3, groupId, inviteData3, timestamp);
}

function addAdmin(key, admin, groupId) {
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

function addUserToGroup(groupId, key, timestamp) {
  const user = 'users/' + key;
  const group = 'groups/' + groupId;

  const edge = usersInGroupsColl.firstExample({
    _from: user,
    _to: group
  });
  if (! edge) {
    usersInGroupsColl.insert({
      _from: user,
      _to: group,
      timestamp
    });
  } else {
    usersInGroupsColl.update(edge, { timestamp });
  }

}

function addMembership(groupId, key, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw 'Group not found';
  }

  const group = groupsColl.document(groupId);
  if (group.isNew && ! group.founders.includes(key)) {
    throw 'Access denied';
  }

  if (group.type == 'primary' && hasPrimaryGroup(key)) {
    throw 'user already has a primary group';
  }

  if (! isEligible(groupId, key)) {
    throw 'Not eligible to join this group';
  }

  const invite = invitationsColl.firstExample({
    _from: 'users/' + key,
    _to: 'groups/' + groupId
  });
  // invites will expire after 24 hours
  if (!invite || timestamp - invite.timestamp >= 86400000) {
    throw 'not invited to join this group';
  }
  // remove invite after joining to not allow reusing that
  invitationsColl.remove(invite);

  addUserToGroup(groupId, key, timestamp);

  if (groupMembers(groupId).length == group.founders.length) {
    groupsColl.update(group, { isNew: false });
  }
  updateEligibles(groupId);
}

function deleteGroup(groupId, key, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw 'Group not found';
  }

  const group = groupsColl.document(groupId);
  if (group.admins.indexOf(key) < 0) {
    throw 'Access Denied';
  }

  invitationsColl.removeByExample({ _to: 'groups/' + groupId });
  usersInGroupsColl.removeByExample({ _to: 'groups/' + groupId });
  groupsColl.remove(group);
}

function deleteMembership(groupId, key, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw 'group not found';
  }
  const group = groupsColl.document(groupId);
  if (group.admins && group.admins.includes(key)) {
    const admins = group.admins.filter(admin => key != admin);
    if (admins.length == 0) {
      throw 'last admin can not leave the group';
    }
    groupsColl.update(group, { admins });
  }
  usersInGroupsColl.removeByExample({
    _from: "users/" + key,
    _to: "groups/" + groupId,
  });
}

function getContext(context) {
  return contextsColl.exists(context) ? contextsColl.document(context) : null;
}

function getApp(app) {
  return appsColl.exists(app) ? appsColl.document(app) : null;
}

function getApps() {
  return appsColl.all().toArray();
}

function appToDic(app) {
  return {
    id: app._key,
    name: app.name,
    context: app.context,
    verification: app.verification,
    verificationUrl: app.verificationUrl,
    logo: app.logo,
    url: app.url,
    assignedSponsorships: app.totalSponsorships,
    unusedSponsorships: unusedSponsorships(app._key)
  };
}

function getUserByContextId(coll, contextId) {
  return query`
    FOR l in ${coll}
      FILTER l.contextId == ${contextId}
      RETURN l.user
  `.toArray()[0];
}

function getContextIdsByUser(coll, id) {
  return query`
    FOR u in ${coll}
      FILTER u.user == ${id}
      SORT u.timestamp DESC
      RETURN u.contextId
  `.toArray();
}

function getLastContextIds(coll, appKey) {
  return query`
    FOR c IN ${coll}
      FOR u in ${usersColl}
        FILTER c.user == u._key
        FOR v in verifications
          FILTER v.user == u._key
          FILTER ${appKey} == v.name
          FOR s IN ${sponsorshipsColl}
            FILTER s._from == u._id
            SORT c.timestamp DESC
            COLLECT user = c.user INTO contextIds = c.contextId
            RETURN contextIds[0]
  `.toArray();
}

function userVerifications(user) {
  const verifications = verificationsColl.byExample({
    user
  }).toArray();
  verifications.forEach(v => {
    delete v._key;
    delete v._id;
    delete v._rev;
    delete v.user;
  });
  return verifications;
}

function linkContextId(id, context, contextId, timestamp) {
  const { collection, idsAsHex } = getContext(context);
  const coll = db._collection(collection);
  if (idsAsHex) {
    contextId = contextId.toLowerCase();
  }

  // remove testblocks if exists
  removeTestblock(contextId, 'link');

  const links = coll.byExample({user: id}).toArray();
  const recentLinks = links.filter(
    link => timestamp - link.timestamp < 24*3600*1000
  );
  if (recentLinks.length >=3) {
    throw 'only three contextIds can be linked every 24 hours';
  }

  // accept link if the contextId is used by the same user before
  let link;
  for (link of links) {
    if (link.contextId === contextId) {
      if (timestamp > link.timestamp) {
        coll.update(link, { timestamp });
      }
      return;
    }
  }

  if (getUserByContextId(coll, contextId)) {
    throw 'contextId is duplicate';
  }

  coll.insert({
    user: id,
    contextId,
    timestamp
  });
}

function setRecoveryConnections(conns, key, timestamp) {
  // this function is deprecated and will be removed on v6
  conns.forEach(conn => {
    connect({
      id1: key,
      id2: conn,
      level: 'recovery',
      timestamp
    });
  });
}

function getRecoveryConnections(user) {
  const allConnections = connectionsHistoryColl.byExample({
    _from: 'users/' + user
  }).toArray().map(c => {
    return {
      _to: c._to.replace('users/', ''),
      level: c.level,
      timestamp: c.timestamp
    }
  });
  allConnections.sort((c1, c2) => (c1.timestamp - c2.timestamp));

  // 1) New recovery connections can participate in resetting signing key,
  //    one week after being set as recovery connection. This limit is not
  //    applied to recovery connections that users set for the first time.
  // 2) Removed recovery connections can continue participating in resetting
  //    signing key, for one week after being removed from recovery connections
  const borderTime = Date.now() - (7*24*60*60*1000);
  // when users set their recovery connections for the first time
  let initTimeBorder;
  const res = [];
  for (let conn of allConnections) {
    // ignore not recovery connections
    if (conn.level != 'recovery') {
      continue;
    }
    // ignore connections to users that are already added to result
    if (res.includes(conn._to)) {
      continue;
    }
    // init the initTimeBorder with first recovery connection timestamp plus 24 hours
    if (! initTimeBorder) {
      initTimeBorder = conn.timestamp + (24*60*60*1000);
    }
    // filter connections to a single user
    const history = allConnections.filter(({ _to }) => (_to == conn._to));
    const currentLevel = history[history.length - 1].level;
    if (currentLevel == 'recovery') {
      if (conn.timestamp < borderTime || conn.timestamp < initTimeBorder) {
        // if recovery level set more than 7 days ago or on the first day
        res.push(conn._to);
      }
    } else {
      // find the first connection that removed the recovery level
      const index = _.findIndex(history, conn) + 1;
      // if recovery level removed less than 7 days ago
      if (history[index]['timestamp'] > borderTime) {
        res.push(conn._to);
      }
    }
  }
  return res;
}

function setSigningKey(signingKey, key, timestamp) {
  usersColl.update(key, {
    signingKey,
    updateTime: timestamp
  });
}

function isSponsored(key) {
  return sponsorshipsColl.firstExample({ '_from': 'users/' + key }) != null;
}

function unusedSponsorships(app) {
  const usedSponsorships = sponsorshipsColl.byExample({
    _to: 'apps/' + app
  }).count();
  const { totalSponsorships } = appsColl.document(app);
  return totalSponsorships - usedSponsorships;
}

function sponsor(user, appKey, timestamp) {
  const app = getApp(appKey);
  const context = getContext(app.context);
  if (context) {
    const coll = db._collection(context.collection);
    const contextIds = getContextIdsByUser(coll, user);
    // remove testblocks if exists
    removeTestblock(contextIds[0], 'sponsorship', appKey);
  }

  if (unusedSponsorships(appKey) < 1) {
    throw "app does not have unused sponsorships";
  }

  if (isSponsored(user)) {
    throw "sponsored before";
  }

  sponsorshipsColl.insert({
    _from: 'users/' + user,
    _to: 'apps/' + appKey
  });
}

function loadOperation(key) {
  return query`RETURN DOCUMENT(${operationsColl}, ${key})`.toArray()[0];
}

function upsertOperation(op) {
  if (!operationsColl.exists(op.hash)) {
    op._key = op.hash;
    operationsColl.insert(op);
  } else {
    operationsColl.replace(op.hash, op);
  }
}

function getState() {
  const lastProcessedBlock = variablesColl.document('LAST_BLOCK').value;
  const verificationsBlock = variablesColl.document('VERIFICATION_BLOCK').value;
  const initOp = operationsColl.byExample({'state': 'init'}).toArray().length;
  const sentOp = operationsColl.byExample({'state': 'sent'}).toArray().length;
  return {
    lastProcessedBlock,
    verificationsBlock,
    initOp,
    sentOp
  }
}

function addTestblock(contextId, action, app) {
  testblocksColl.insert({app, contextId, action,"timestamp": Date.now()});
}

function removeTestblock(contextId, action, app) {
  let query;
  if (app) {
    query = {app, contextId, action};
  } else {
    query = {contextId, action};
  }
  testblocksColl.removeByExample(query);
}

function getTestblocks(app, contextId) {
  return testblocksColl.byExample({
    "app": app,
    "contextId": contextId,
  }).toArray().map(b => b.action);
}

function loadGroup(groupId) {
  return query`RETURN DOCUMENT(${groupsColl}, ${groupId})`.toArray()[0];
}

function groupInvites(groupId) {
  return invitationsColl.byExample({
    "_to": 'groups/' + groupId,
  }).toArray().filter(invite => {
    return Date.now() - invite.timestamp < 86400000
  }).map(invite => {
    return {
      inviter: invite.inviter,
      invitee: invite._from.replace('users/', ''),
      id: invite._key,
      data: invite.data,
      timestamp: invite.timestamp
    }
  });
}

function updateGroup(admin, groupId, url, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw 'group not found';
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(admin)) {
    throw 'only admins can update the group';
  }
  groupsColl.update(group, {
    url,
    timestamp
  });
}

module.exports = {
  connect,
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
  userConnections,
  userGroups,
  loadUser,
  userInvitedGroups,
  createUser,
  groupMembers,
  userScore,
  getContext,
  getApp,
  getApps,
  appToDic,
  userVerifications,
  getUserByContextId,
  getContextIdsByUser,
  sponsor,
  isSponsored,
  linkContextId,
  loadOperation,
  upsertOperation,
  setRecoveryConnections,
  setSigningKey,
  getLastContextIds,
  unusedSponsorships,
  getState,
  getReporters,
  getRecoveryConnections,
  userToDic,
  groupToDic,
  addTestblock,
  removeTestblock,
  getTestblocks,
  loadGroup,
  groupInvites,
  updateEligibles,
  updateGroup
};
