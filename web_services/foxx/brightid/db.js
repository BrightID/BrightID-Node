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
const wISchnorrServer  = require('./WISchnorrServer');

const connectionsColl = db._collection('connections');
const connectionsHistoryColl = db._collection('connectionsHistory');
const groupsColl = db._collection('groups');
const usersInGroupsColl = db._collection('usersInGroups');
const usersColl = db._collection('users');
const appsColl = db._collection('apps');
const sponsorshipsColl = db._collection('sponsorships');
const operationsColl = db._collection('operations');
const invitationsColl = db._collection('invitations');
const verificationsColl = db._collection('verifications');
const variablesColl = db._collection('variables');
const cachedParamsColl = db._collection('cachedParams');
const appIdsColl = db._collection('appIds');

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
      throw new errors.IneligibleRecoveryConnectionError();
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

  connectionsHistoryColl.insert({ _from, _to, level, reportReason, replacedWith, requestProof, timestamp });

  if (! conn) {
    connectionsColl.insert({ _from, _to, level, reportReason, replacedWith, requestProof, timestamp, initTimestamp: timestamp });
  } else {
    connectionsColl.update(conn, { level, reportReason, replacedWith, requestProof, timestamp });
  }
}

function userConnections(userId, direction = 'outbound') {
  let query, resIdAttr;
  if (direction == 'outbound') {
    query = { _from: 'users/' + userId };
    resIdAttr = '_to';
  } else if (direction == 'inbound') {
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
  const {
    isHead: isFamilyGroupHead,
    isMember: isFamilyGroupMember,
  } = hasFamilyGroup(userId);
  return {
    id: u._key,
    signingKeys: u.signingKeys,
    verifications: userVerifications(u._key).map(v => v.name),
    recoveryConnections: Object.values(getRecoveryConnections(u._key)),
    reporters: getReporters(u._key),
    createdAt: u.createdAt,
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

function groupToDic(groupId) {
  const group = groupsColl.document('groups/' + groupId);
  return {
    id: group._key,
    members: groupMembers(group._key),
    type: group.type || 'general',
    admins: group.admins,
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

function userInvites(userId) {
  return invitationsColl.byExample({
    _from: 'users/' + userId
  }).toArray().filter(invite => {
    return Date.now() - invite.timestamp < 86400000
  }).map(invite => {
    const groupId = invite._to.replace('groups/', '');
    return {
      group: groupId,
      inviter: invite.inviter,
      invitee: userId,
      id: hash(groupId + invite.inviter + userId + invite.timestamp),
      data: invite.data,
      timestamp: invite.timestamp
    };
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

  if (group.type == 'family') {
    if (hasFamilyGroup(invitee)['isMember']) {
      throw new errors.AlreadyIsFamilyGroupMember();
    }
    let members = usersInGroupsColl.byExample({
      _to: "groups/" + group._key,
    }).toArray().map(e => e._from);
    const conectedMembers = query`
      FOR conn in ${connectionsColl}
        FILTER conn._from == ${'users/' + invitee}
        FILTER conn._to IN ${members}
        FILTER conn.level IN ['already known', 'recovery']
        FOR conn2 in ${connectionsColl}
          FILTER conn2._from == conn._to
          FILTER conn2._to == conn._from
          FILTER conn2.level IN ['already known', 'recovery']
        RETURN conn._to
    `.toArray();
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

function createGroup(groupId, key1, url, type, timestamp) {
  if (! ['general', 'family'].includes(type)) {
    throw new errors.InvalidGroupTypeError(type);
  }

  if (groupsColl.exists(groupId)) {
    throw new errors.DuplicateGroupError();
  }

  const group = {
    _key: groupId,
    score: 0,
    admins: [key1],
    url,
    type,
    timestamp,
  }

  if (type == 'family') {
    if (hasFamilyGroup(key1)['isHead']) {
      throw new errors.AlreadyIsFamilyGroupHead();
    }
    group.head = key1;
    group.vouchers = [];
  }

  groupsColl.insert(group);
  // Add the creator to the group now.
  addUserToGroup(groupId, key1, timestamp);
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
  const _from = 'users/' + key;
  const _to = 'groups/' + groupId;

  const edge = usersInGroupsColl.firstExample({ _from, _to });
  if (! edge) {
    usersInGroupsColl.insert({ _from, _to, timestamp });
  } else {
    usersInGroupsColl.update(edge, { timestamp });
  }
  // empty the group's vouchers after family group member changes
  const group = groupsColl.document(groupId);
  if (group.type == 'family') {
    groupsColl.update(group, { vouchers: [] });
  }
}

function addMembership(groupId, key, timestamp) {
  if (! groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }

  const invite = invitationsColl.firstExample({
    _from: 'users/' + key,
    _to: 'groups/' + groupId
  });
  // invites will expire after 72 hours
  if (!invite || timestamp - invite.timestamp >= 259200000) {
    throw new errors.NotInvitedError();
  }
  // remove invite after joining to not allow reusing that
  invitationsColl.remove(invite);

  const group = groupsColl.document(groupId);
  if (group.type == 'family') {
    if (hasFamilyGroup(groupId)['isMember']) {
      throw new errors.AlreadyIsFamilyGroupMember();
    }

    let members = usersInGroupsColl.byExample({
      _to: "groups/" + group._key,
    }).toArray().map(e => e._from);

    const conectedMembers = query`
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
    if (! _.isEqual(members.sort(), conectedMembers.sort())) {
      throw new errors.IneligibleFamilyGroupMember();
    }
  }
  addUserToGroup(groupId, key, timestamp);
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
  // empty the group's vouchers after family group member changes
  if (group.type == 'family') {
    groupsColl.update(group, { vouchers: [] });
  }
}

function getCachedParams(pub) {
  const d = cachedParamsColl.firstExample({ public: pub })
  if (! d) {
    throw new errors.CachedParamsNotFound();
  }
  return d;
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
    verification: app.verification,
    verifications: app.verifications,
    verificationUrl: app.verificationUrl,
    logo: app.logo,
    url: app.url,
    assignedSponsorships: app.totalSponsorships,
    unusedSponsorships: unusedSponsorships(app._key),
    testing: app.testing,
    idsAsHex: app.idsAsHex,
    usingBlindSig: app.usingBlindSig,
    verificationExpirationLength: app.verificationExpirationLength,
    sponsorPublicKey: app.sponsorPublicKey,
    nodeUrl: app.nodeUrl,
  };
}

function userVerifications(user) {
  let verifications;
  if (variablesColl.exists('VERIFICATIONS_HASHES')) {
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
    const block = Math.max(...Object.keys(hashes).map(block => parseInt(block)));
    verifications = verificationsColl.byExample({ user, block }).toArray();
  } else {
    verifications = verificationsColl.byExample({ user }).toArray();
  }
  verifications.forEach(v => {
    delete v._key;
    delete v._id;
    delete v._rev;
    delete v.user;
  });
  return verifications;
}

function getRecoveryPeriods(allConnections, user, now) {
  const recoveryPeriods = [];
  const history = allConnections.filter(c => c.id == user);
  let open = false;
  let period = {};
  for (let i = 0; i < history.length; i++) {
    if (history[i].level == 'recovery' && !open) {
      open = true;
      period['start'] = history[i].timestamp
    } else if (history[i].level != 'recovery' && open) {
      period['end'] = history[i].timestamp;
      recoveryPeriods.push(period);
      period = {};
      open = false;
    }
  }
  if (open) {
    period['end'] = now;
    recoveryPeriods.push(period);
  }
  return recoveryPeriods;
}

function isActiveRecovery(recoveryPeriods, firstDayBorder, aWeek, aWeekBorder) {
  for (const period of recoveryPeriods) {
    if (period.end > aWeekBorder &&
      (period.end - period.start > aWeek || period.start < firstDayBorder)
    ) {
      return true;
    }
  }
  return false;
}

function getActiveAfter(recoveryPeriods, firstDayBorder, aWeek, now) {
  const lastPeriod = recoveryPeriods[recoveryPeriods.length - 1];
  if (lastPeriod.end == now &&
    lastPeriod.end - lastPeriod.start < aWeek &&
    lastPeriod.start > firstDayBorder
  ) {
    return aWeek - (lastPeriod.end - lastPeriod.start);
  }
  return 0;
}

function countActiveBefore(recoveryPeriods, firstDayBorder, aWeek, aWeekBorder, now) {
  for (const period of recoveryPeriods) {
    if (period.end > aWeekBorder &&
      (period.end - period.start > aWeek || period.start < firstDayBorder)
    ) {
      if (period.end == now) {
        return 0;
      } else {
        return period.end - aWeekBorder;
      }
    }
  }
  return 0;
}

function getRecoveryConnections(user, direction = 'outbound') {
  const res = {};
  let query, resIdAttr;
  if (direction == 'outbound') {
    query = { _from: 'users/' + user };
    resIdAttr = '_to';
  } else if (direction == 'inbound') {
    query = { _to: 'users/' + user };
    resIdAttr = '_from';
  }
  const allConnections = connectionsHistoryColl.byExample(query).toArray().map(c => {
    return {
      id: c[resIdAttr].replace('users/', ''),
      level: c.level,
      timestamp: c.timestamp
    }
  });
  allConnections.sort((c1, c2) => (c1.timestamp - c2.timestamp));
  const recoveryConnections = allConnections.filter(conn => conn.level == 'recovery');
  if (recoveryConnections.length == 0) {
    return res
  }

  const now = Date.now();
  const firstDayBorder = recoveryConnections[0].timestamp + (24 * 60 * 60 * 1000);
  const aWeek = 7 * 24 * 60 * 60 * 1000;
  const aWeekBorder = Date.now() - aWeek;
  const recoveryIds = new Set(recoveryConnections.map(conn => conn.id));

  // 1) New recovery connections can participate in resetting signing key,
  //    one week after being set as recovery connection. This limit is not
  //    applied to recovery connections that users set for the first time.
  // 2) Removed recovery connections can continue participating in resetting
  //    signing key, for one week after being removed from recovery connections
  for (let id of recoveryIds) {
    // find the periods that this user was recovery
    const recoveryPeriods = getRecoveryPeriods(allConnections, id, now);
    // find this user is recovery now
    const isActive = isActiveRecovery(recoveryPeriods, firstDayBorder, aWeek, aWeekBorder);
    // if recovery level set earlier than 7 days and not on the first day
    // will active after 7 days since became recovery
    const activeAfter = isActive ? 0 : getActiveAfter(recoveryPeriods, firstDayBorder, aWeek, now);
    // if a recovery connection lost recovery level earlier than 7 days remains active until 7 days
    const activeBefore = isActive ? countActiveBefore(recoveryPeriods, firstDayBorder, aWeek, aWeekBorder, now) : 0;

    if (isActive || activeAfter > 0 || activeBefore > 0) {
      res[id] = { id, isActive, activeBefore, activeAfter }
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

function sponsor(op) {
  if (unusedSponsorships(op.app) < 1) {
    throw new errors.UnusedSponsorshipsError(op.app);
  }

  if (isSponsored(op.id)) {
    throw new errors.SponsoredBeforeError();
  }

  sponsorshipsColl.insert({
    _from: 'users/' + op.id,
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

function insertAppIdVerification(app, uid, appId, verification, roundedTimestamp) {
  const d = appIdsColl.firstExample({ uid });
  if (d) {
    throw new errors.DuplicateUIDError(uid);
  } else {
    appIdsColl.insert({
      app,
      uid,
      appId,
      verification,
      roundedTimestamp,
    });
  }
}

function getState() {
  const lastProcessedBlock = variablesColl.document('LAST_BLOCK').value;
  const verificationsBlock = variablesColl.document('VERIFICATION_BLOCK').value;
  const initOp = operationsColl.byExample({'state': 'init'}).count();
  const sentOp = operationsColl.byExample({'state': 'sent'}).count();
  const verificationsHashes = JSON.parse(variablesColl.document('VERIFICATIONS_HASHES').hashes);
  let wISchnorrPublic = null;
  if (module.context && module.context.configuration && module.context.configuration.wISchnorrPassword){
    const password = module.context.configuration.wISchnorrPassword;
    const server = new wISchnorrServer();
    server.GenerateSchnorrKeypair(password);
    wISchnorrPublic = server.ExtractPublicKey();
  }
  return {
    lastProcessedBlock,
    verificationsBlock,
    initOp,
    sentOp,
    verificationsHashes,
    wISchnorrPublic
  }
}

function loadGroup(groupId) {
  return query`RETURN DOCUMENT(${groupsColl}, ${groupId})`.toArray()[0];
}

function groupInvites(groupId) {
  return invitationsColl.byExample({
    "_to": 'groups/' + groupId,
  }).toArray().filter(invite => {
    // invites will expire after 72 hours
    return Date.now() - invite.timestamp < 259200000
  }).map(invite => {
    const invitee = invite._from.replace('users/', '');
    return {
      group: groupId,
      inviter: invite.inviter,
      invitee,
      id: hash(groupId + invite.inviter + invitee + invite.timestamp),
      data: invite.data,
      timestamp: invite.timestamp
    }
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

  // user cannot vouch for the groups which waiting for users to join
  if (groupInvites(groupId).length > 0 || groupMembers(groupId).length < 2) {
    throw new errors.IneligibleToVouch();
  }

  let members = usersInGroupsColl.byExample({
    _to: "groups/" + group._key,
  }).toArray().map(e => e._from);

  const conectedMembers = query`
    FOR conn in ${connectionsColl}
      FILTER conn._from == ${'users/' + id}
      FILTER conn._to IN ${members}
      FILTER conn.level IN ['already known', 'recovery']
      FOR conn2 in ${connectionsColl}
        FILTER conn2._from == conn._to
        FILTER conn2._to == conn._from
        FILTER conn2.level IN ['already known', 'recovery']
      RETURN conn._to
  `.toArray();
  if (! _.isEqual(members.sort(), conectedMembers.sort())) {
    throw new errors.IneligibleToVouchFor();
  }
  group.vouchers.push(id);
  groupsColl.update(group, { vouchers: group.vouchers });
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
  const familyGroups = query`
    FOR conn in ${usersInGroupsColl}
      FILTER conn._from IN ${connections}
      FOR group in ${groupsColl}
        FILTER group._id == conn._to
        FILTER group.type == 'family'
      RETURN DISTINCT group
  `.toArray();
  for (let group of familyGroups) {
    const members = groupMembers(group._key);
    if (group.vouchers.includes(userId) ||
      members.length < 2 ||
      groupInvites(group._key).length > 0) {
      continue;
    }

    const conectedToAll = members.every(m => connections.includes('users/' + m));
    if (conectedToAll) {
      result.push(group._key);
    }
  }
  return result;
}

function transferFamilyHead(key, head, groupId) {
  if (! groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  if (! usersInGroupsColl.firstExample({
      _from: 'users/' + head,
      _to: 'groups/' + groupId
    })) {
    throw new errors.IneligibleFamilyGroupHead();
  }
  if (hasFamilyGroup(key)['isHead']) {
    throw new errors.AlreadyIsFamilyGroupHead();
  }
  const group = groupsColl.document(groupId);
  if (! group.head == key) {
    throw new errors.NotHeadError();
  }
  groupsColl.update(group, { head });
  addAdmin(key, head, groupId);
}

module.exports = {
  connect,
  createGroup,
  deleteGroup,
  addAdmin,
  addMembership,
  deleteMembership,
  invite,
  dismiss,
  userConnections,
  userGroups,
  loadUser,
  userInvites,
  createUser,
  groupMembers,
  userScore,
  getApp,
  getApps,
  appToDic,
  userVerifications,
  sponsor,
  isSponsored,
  loadOperation,
  upsertOperation,
  insertAppIdVerification,
  setSigningKey,
  unusedSponsorships,
  getState,
  getReporters,
  getRecoveryConnections,
  userToDic,
  groupToDic,
  addSigningKey,
  removeSigningKey,
  removeAllSigningKeys,
  loadGroup,
  groupInvites,
  updateGroup,
  getCachedParams,
  hasFamilyGroup,
  vouchFamilyGroup,
  userEligibleGroupsToVouch,
  transferFamilyHead,
};
