'use strict';
const { sha256 } = require('@arangodb/crypto');
const { query, db } = require('@arangodb');
const _ = require('lodash');
const stringify = require('fast-json-stable-stringify');
const nacl = require('tweetnacl');
const {
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  urlSafeB64ToB64,
  strToUint8Array,
  b64ToUint8Array,
  hash
} = require('./encoding');
const errors = require('./errors');

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

  const _from = 'users/' + key1;
  const _to = 'users/' + key2;
  if (level == 'recovery') {
    const tf = connectionsColl.firstExample({ '_from': _to, '_to': _from });
    if (!tf || !['already known', 'recovery'].includes(tf.level)) {
      throw new errors.IneligibleRecoveryConnection();
    }
  }

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
    throw new errors.UserNotFoundError(replacedWith);
  }
  if (! level) {
    // Set 'just met' as confidence level when old addConnection is called
    // and there was no other level set directly using Connect
    // this if should be removed when v5 dropped and "Add Connection" operation removed
    level = conn ? conn.level : 'just met';
  }

  connectionsHistoryColl.insert({ _from, _to, level, reportReason, replacedWith, requestProof, timestamp });

  if (! conn) {
    connectionsColl.insert({ _from, _to, level, reportReason, replacedWith, requestProof, timestamp, initTimestamp: timestamp });
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
      familyVouchConnection: conn.familyVouchConnection || false,
      reportReason: conn.reportReason || undefined,
      timestamp: conn.timestamp
    }
  });
}

function userToDic(userId) {
  const u = usersColl.document('users/' + userId);
  let {
    isFamilyGroupHead: isHead,
    isFamilyGroupMember: isMember
  } = hasFamilyGroup(userId);
  return {
    id: u._key,
    // all signing keys will be returned on v6
    signingKey: u.signingKeys[0],
    // score is deprecated and will be removed on v6
    score: u.score,
    verifications: userVerifications(u._key).map(v => v.name),
    // trusted is deprecated and will be replaced by recoveryConnections on v6
    trusted: getRecoveryConnections(u._key),
    // flaggers is deprecated and will be replaced by reporters on v6
    flaggers: getReporters(u._key),
    createdAt: u.createdAt,
    // eligible_groups is deprecated and will be removed on v6
    eligible_groups: u.eligible_groups || [],
    isFamilyGroupHead,
    isFamilyGroupMember,
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

// this function is deprecated and will be removed on v6
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

// this function is deprecated and will be removed on v6
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
    head: group.head || '',
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
    throw new errors.GroupNotFoundError(groupId);
  }

  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(inviter)) {
    throw new errors.NotAdminError();
  }

  if (group.isNew && ! group.founders.includes(invitee)) {
    throw new errors.NewUserBeforeFoundersJoinError();
  }

  if (group.type == 'family') {
    if (hasFamilyGroup(invitee)['isMember']) {
      throw new errors.AlreadyIsFamilyGroupMember();
    }
    let members = usersInGroupsColl.byExample({
      _to: "groups/" + group._key,
    }).toArray().map(e => e._from);
    const toMemberConnections = query`
      FOR conn in ${connectionsColl}
        FILTER conn._from == ${'users/' + invitee}
        FILTER conn._to IN ${members}
        FILTER conn.level IN ['already known', 'recovery']
        FOR conn2 in ${connectionsColl}
          FILTER conn2._from == conn._to
          FILTER conn2._to == conn._from
          FILTER conn2.level IN ['already known', 'recovery']
        RETURN conn
    `.toArray();
    const conectedMembers = toMemberConnections.map(c => c._to);
    if (! _.isEqual(members.sort(), conectedMembers.sort())) {
      throw new errors.IneligibleFamilyGroupMember();
    }
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
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(dismisser)) {
    throw new errors.NotAdminError();
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
      signingKeys: [urlSafeB64ToB64(key)],
      createdAt: timestamp,
      _key: key
    });
  } else {
    return user;
  }
}

function hasFamilyGroup(key) {
  const res = { isHead: false, isMember: false };
  const groupIds = usersInGroupsColl.byExample({
    _from: 'users/' + key
  }).toArray().map(ug => ug._to.replace('groups/', ''));
  const groups = groupsColl.documents(groupIds).documents;
  groups.filter(group => group.type == 'family').forEach(g => {
    if (g.head == key) {
      res.isHead = true;
    } else {
      res.isMember = true;
    }
  });
  return res;
}

function createGroup(groupId, key1, key2, inviteData2, key3, inviteData3, url, type, timestamp) {
  if (! ['general', 'family'].includes(type)) {
    throw new errors.InvalidGroupTypeError(type);
  }

  if (groupsColl.exists(groupId)) {
    throw new errors.DuplicateGroupError();
  }

  const conns = connectionsColl.byExample({
    _to: 'users/' + key1
  }).toArray().map(u => u._from.replace("users/", ""));
  if (conns.indexOf(key2) < 0 || conns.indexOf(key3) < 0) {
    throw new errors.InvalidCoFoundersError();
  }

  const founders = [key1, key2, key3].sort()
  const group = {
    _key: groupId,
    score: 0,
    isNew: true,
    admins: founders,
    url,
    type,
    timestamp,
    founders
  }

  if (type == 'family') {
    const ids = [key1, key2, key3].map(u => 'users/' + u);
    const inGroupConnections = query`
      FOR conn in ${connectionsColl}
        FILTER conn._from IN ${ids}
        FILTER conn._to IN ${ids}
        FILTER conn.level IN ['already known', 'recovery']
        RETURN conn
    `.toArray();

    if (inGroupConnections.length != 6) {
      throw new errors.IneligibleFamilyGroupFounders();
    }

    if (hasFamilyGroup(key1)['isHead']) {
      throw new errors.AlreadyIsFamilyGroupHead();
    }

    if (hasFamilyGroup(key2)['isMember'] || hasFamilyGroup(key3)['isMember']) {
      throw new errors.AlreadyIsFamilyGroupMember();
    }
    group['head'] = key1;
  }

  groupsColl.insert(group);
  // Add the creator and invite other cofounders to the group now.
  // The other two "co-founders" have to join using /membership
  addUserToGroup(groupId, key1, timestamp);
  invite(key1, key2, groupId, inviteData2, timestamp);
  invite(key1, key3, groupId, inviteData3, timestamp);
}

function addAdmin(key, admin, groupId) {
  if (! groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  if (! usersInGroupsColl.firstExample({
      _from: 'users/' + admin,
      _to: 'groups/' + groupId
    })) {
    throw new errors.IneligibleNewAdminError();
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(key)) {
    throw new errors.NotAdminError();
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
    throw new errors.GroupNotFoundError(groupId);
  }

  const group = groupsColl.document(groupId);
  if (group.isNew && ! group.founders.includes(key)) {
    throw new errors.NewUserBeforeFoundersJoinError();
  }

  if (group.type == 'family') {
    if (hasFamilyGroup(groupId)['isMember']) {
      throw new errors.AlreadyIsFamilyGroupMember();
    }

    let members = usersInGroupsColl.byExample({
      _to: "groups/" + group._key,
    }).toArray().map(e => e._from);

    const connections = query`
      FOR conn in ${connectionsColl}
        FILTER conn._from == ${'users/' + key}
        FILTER conn._to IN ${members}
        FILTER conn.level IN ['already known', 'recovery']
        FOR conn2 in ${connectionsColl}
          FILTER conn2._from == conn._to
          FILTER conn2._to == conn._from
          FILTER conn2.level IN ['already known', 'recovery']
        RETURN conn._to
    `.toArray();
    if (! _.isEqual(members.sort(), connections.sort())) {
      throw new errors.IneligibleFamilyGroupMember();
    }
  }

  const invite = invitationsColl.firstExample({
    _from: 'users/' + key,
    _to: 'groups/' + groupId
  });
  // invites will expire after 24 hours
  if (!invite || timestamp - invite.timestamp >= 86400000) {
    throw new errors.NotInvitedError();
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
    throw new errors.GroupNotFoundError(groupId);
  }

  const group = groupsColl.document(groupId);
  if (group.admins.indexOf(key) < 0) {
    throw new errors.NotAdminError();
  }

  invitationsColl.removeByExample({ _to: 'groups/' + groupId });
  usersInGroupsColl.removeByExample({ _to: 'groups/' + groupId });
  groupsColl.remove(group);
}

function deleteMembership(groupId, key, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
  if (group.admins && group.admins.includes(key)) {
    const admins = group.admins.filter(admin => key != admin);
    const members = groupMembers(groupId);
    if (admins.length == 0 && members.length > 1) {
      throw new errors.LeaveGroupError();
    }
    groupsColl.update(group, { admins });
  }
  usersInGroupsColl.removeByExample({
    _from: "users/" + key,
    _to: "groups/" + groupId,
  });
}

function getContext(context) {
  if (! contextsColl.exists(context)) {
    throw new errors.ContextNotFoundError(context);
  }
  return contextsColl.document(context);
}

function getApp(app) {
  if (! appsColl.exists(app)) {
    throw new errors.AppNotFoundError(app);
  }
  return appsColl.document(app);
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
    unusedSponsorships: unusedSponsorships(app._key),
    testing: app.testing
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
  let hashes = variablesColl.document('VERIFICATIONS_HASHES').hashes;
  hashes = JSON.parse(hashes);
  // const snapshotPeriod = hashes[1]['block'] - hashes[0]['block']
  // const lastBlock = variablesColl.document('LAST_BLOCK').value;
  // // We want verifications from the second-most recently generated snapshot
  // // prior to LAST_BLOCK. We use this approach to ensure all synced nodes return
  // // verifications from same block regardless of how fast they are in processing
  // // new generated snapshots and adding new verifications to database.
  // let block;
  // if (lastBlock > hashes[1]['block'] + snapshotPeriod) {
  //   block = hashes[1]['block'];
  // } else {
  //   block = hashes[0]['block'];
  // }

  // rollback consneus based block selection consneus temporarily to ensure faster verification
  let block = Math.max(...Object.keys(hashes));

  const verifications = verificationsColl.byExample({ user, block }).toArray();
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
  if (!contextId) {
    throw new errors.InvalidContextIdError(contextId);
  }

  if (idsAsHex) {
    const re = new RegExp(/^0[xX][A-Fa-f0-9]+$/);
    if(!re.test(contextId)) {
      throw new errors.InvalidContextIdError(contextId);
    }
    contextId = contextId.toLowerCase();
  }

  // remove testblocks if exists
  removeTestblock(contextId, 'link');

  let user = getUserByContextId(coll, contextId);
  if (user && user != id) {
    throw new errors.DuplicateContextIdError(contextId);
  }

  const links = coll.byExample({user: id}).toArray();
  const recentLinks = links.filter(
    link => timestamp - link.timestamp < 24*3600*1000
  );
  if (recentLinks.length >= 3) {
    throw new errors.TooManyLinkRequestError();
  }

  // accept link if the contextId is used by the same user before
  for (let link of links) {
    if (link.contextId === contextId) {
      if (timestamp > link.timestamp) {
        coll.update(link, { timestamp });
      }
      return;
    }
  }

  coll.insert({
    user: id,
    contextId,
    timestamp
  });

  // sponsor the user if contextId is temporarily sponsored
  const tempSponsorship = sponsorshipsColl.firstExample({ contextId });
  if (tempSponsorship) {
    const app = tempSponsorship._to.replace('apps/', '');
    sponsorshipsColl.remove( tempSponsorship._key );
    // pass contextId instead of id to broadcast sponsor operation
    sponsor({ contextId, app, timestamp });

  }
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
    signingKeys: [signingKey],
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

// this method is called in different situations:
// 1) Sponsor operation with contextId is posted to the brightid service.
//    a) contextId may already be linked to a brightid
//    b) or it may not be linked yet
// 2) Sponsor operation with user id is sent to the apply service
// 3) Link ContextId operation is sent to the apply service for
//    a contextId that was sponsored temporarily before linking
function sponsor(op) {
  if (unusedSponsorships(op.app) < 1) {
    throw new errors.UnusedSponsorshipsError(op.app);
  }

  // if 2) Sponsor operation with user id is sent to the apply service
  if (op.id) {
    if (isSponsored(op.id)) {
      throw new errors.SponsoredBeforeError();
    }
    sponsorshipsColl.insert({
      _from: 'users/' + op.id,
      _to: 'apps/' + op.app,
      timestamp: op.timestamp,
    });
    return;
  }

  // if we have user contextId
  const app = getApp(op.app);
  const context = getContext(app.context);
  if (!app.sponsorPrivateKey) {
    throw new errors.SponsorNotSupportedError(op.app);
  }

  const coll = db._collection(context.collection);
  if (context.idsAsHex) {
    op.contextId = op.contextId.toLowerCase();
  }
  // remove testblocks if exists
  removeTestblock(op.contextId, 'sponsorship', op.app);
  const id = getUserByContextId(coll, op.contextId);

  // if 1-b) Sponsor operation with contextId is posted to the brightid service
  // but contextId is not linked to a brightid yet
  // add a temporary sponsorship to be applied after user linked contextId
  if (!id) {
    sponsorshipsColl.insert({
      _from: 'users/0',
      _to: 'apps/' + op.app,
      // it will expire after one hour
      expireDate: Math.ceil((Date.now() / 1000) + 3600),
      contextId: op.contextId
    });
    return;
  }

  if (isSponsored(id)) {
    throw new errors.SponsoredBeforeError();
  }

  // if 1-a or 3

  // broadcast sponsor operation with user brightid that can be applied
  // by all nodes including those that not support sponsor app's context
  const sponsorUserOp = {
    name: 'Sponsor',
    app: op.app,
    id,
    timestamp: op.timestamp,
    v: 5
  }
  const message = stringify(sponsorUserOp);
  sponsorUserOp.sig = uInt8ArrayToB64(Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(app.sponsorPrivateKey))));
  sponsorUserOp.hash = hash(message);
  sponsorUserOp.state = 'init';
  upsertOperation(sponsorUserOp);

  // sponsor user instantly instead of waiting for applying sponsor operation
  // with user brightid, to prevent apps getting not sponsored error for users
  // that are sponsored before linking, when link operation applied but
  // broadcasted sponsor operation not arrived yet.
  // this approach may result in loosing consensus in sponsorships but
  // seems not to be important
  sponsorshipsColl.insert({
    _from: 'users/' + id,
    _to: 'apps/' + op.app,
    timestamp: op.timestamp,
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
  const initOp = operationsColl.byExample({'state': 'init'}).count();
  const sentOp = operationsColl.byExample({'state': 'sent'}).count();
  const verificationsHashes = JSON.parse(variablesColl.document('VERIFICATIONS_HASHES').hashes);
  return {
    lastProcessedBlock,
    verificationsBlock,
    initOp,
    sentOp,
    verificationsHashes
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

function getContextIds(coll) {
  return coll.all().toArray().map(c => {
    return {
      user: c.user,
      contextId: c.contextId,
      timestamp: c.timestamp
    }
  });
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

function removePasscode(contextKey) {
  contextsColl.update(contextKey, {
    passcode: null
  });
}

function updateGroup(admin, groupId, url, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
  if (! group.admins || ! group.admins.includes(admin)) {
    throw new errors.NotAdminError();
  }
  groupsColl.update(group, {
    url,
    timestamp
  });
}

function addSigningKey(id, signingKey, timestamp) {
  const signingKeys = usersColl.document(id).signingKeys || [];
  if (signingKeys.indexOf(signingKey) == -1) {
    signingKeys.push(signingKey);
    usersColl.update(id, { signingKeys });
  }
}

function removeSigningKey(id, signingKey) {
  let signingKeys = usersColl.document(id).signingKeys || [];
  signingKeys = signingKeys.filter(s => s != signingKey);
  usersColl.update(id, { signingKeys });
}

function removeAllSigningKeys(id, signingKey) {
  let signingKeys = usersColl.document(id).signingKeys || [];
  signingKeys = signingKeys.filter(s => s == signingKey);
  usersColl.update(id, { signingKeys });
}

function vouchFamilyGroup(id, groupId, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }

  const group = groupsColl.document(groupId);
  if (group.type != 'family') {
      throw new errors.NotFamilyGroupError();
  }

  // user cannot vouch for the new groups or the groups created in the past 24 hours
  if (group.isNew || group.timestamp > Date.now() - (24*60*60*1000)) {
    throw new errors.IneligibleToVouch();
  }

  let members = usersInGroupsColl.byExample({
    _to: "groups/" + group._key,
  }).toArray().map(e => e._from);

  const toMemberConnections = query`
    FOR conn in ${connectionsColl}
      FILTER conn._from == ${'users/' + id}
      FILTER conn._to IN ${members}
      FILTER conn.level IN ['already known', 'recovery']
      FOR conn2 in ${connectionsColl}
        FILTER conn2._from == conn._to
        FILTER conn2._to == conn._from
        FILTER conn2.level IN ['already known', 'recovery']
      RETURN conn
  `.toArray();
  const conectedMembers = toMemberConnections.map(c => c._to);
  if (! _.isEqual(members.sort(), conectedMembers.sort())) {
    throw new errors.IneligibleToVouchFor();
  }

  toMemberConnections.forEach(conn => {
    connectionsColl.update(conn, {familyVouchConnection: true});
  });
}

function userEligibleGroupsToVouch(userId) {
  const result = [];
  const connections = query`
    FOR conn in ${connectionsColl}
      FILTER conn._from == ${'users/' + userId}
      FILTER conn.level IN ['already known', 'recovery']
      FOR conn2 in ${connectionsColl}
        FILTER conn2._from == conn._to
        FILTER conn2._to == conn._from
        FILTER conn2.level IN ['already known', 'recovery']
      RETURN conn._to
  `.toArray();
  for (let connection of connections) {
    const groupIds = usersInGroupsColl.byExample({
      _from: connection
    }).toArray().map(ug => ug._to.replace('groups/', ''));
    const groups = groupsColl.documents(groupIds).documents;
    groups.filter(group => group.type == 'family').forEach(group => {
      let members = usersInGroupsColl.byExample({
        _to: "groups/" + group._key,
      }).toArray().map(e => e._from);
      const conectedToAll = members.every(m => connections.includes(m));
      if (conectedToAll && !result.includes(group._key)) {
        result.push(group._key);
      }
    });
  }
  return result;
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
  addSigningKey,
  removeSigningKey,
  removeAllSigningKeys,
  getContextIds,
  removePasscode,
  loadGroup,
  groupInvites,
  updateEligibles,
  updateGroup,
  hasFamilyGroup,
  vouchFamilyGroup,
  userEligibleGroupsToVouch,
};
