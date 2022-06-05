"use strict";
const { query, db } = require("@arangodb");
const _ = require("lodash");
const {
  urlSafeB64ToB64,
  hash,
  priv2addr,
  getNaclKeyPair,
  getEthKeyPair,
  getConsensusSenderAddress,
} = require("./encoding");
const errors = require("./errors");
const wISchnorrServer = require("./WISchnorrServer");

const connectionsColl = db._collection("connections");
const connectionsHistoryColl = db._collection("connectionsHistory");
const groupsColl = db._collection("groups");
const usersInGroupsColl = db._collection("usersInGroups");
const usersColl = db._collection("users");
const appsColl = db._collection("apps");
const sponsorshipsColl = db._collection("sponsorships");
const operationsColl = db._collection("operations");
const invitationsColl = db._collection("invitations");
const verificationsColl = db._collection("verifications");
const variablesColl = db._collection("variables");
const cachedParamsColl = db._collection("cachedParams");
const appIdsColl = db._collection("appIds");

function connect(op) {
  let {
    id1: key1,
    id2: key2,
    level,
    reportReason,
    replacedWith,
    requestProof,
    timestamp,
  } = op;

  if (key1 == key2) {
    throw new errors.ForbiddenConnectionError();
  }

  const _from = "users/" + key1;
  const _to = "users/" + key2;
  if (level == "recovery") {
    const tf = connectionsColl.firstExample({ _from: _to, _to: _from });
    if (!tf || !["already known", "recovery"].includes(tf.level)) {
      throw new errors.IneligibleRecoveryConnectionError();
    }
  }

  // create user by adding connection if it's not created
  // todo: we should prevent non-verified users from creating new users by making connections.
  const u1 = usersColl.exists(key1)
    ? usersColl.document(key1)
    : createUser(key1, timestamp);
  const u2 = usersColl.exists(key2)
    ? usersColl.document(key2)
    : createUser(key2, timestamp);

  // set the first verified user that connect to a user as its parent
  let verifications = userVerifications(key1);
  if (!u2.parent && verifications.map((v) => v.name).includes("BrightID")) {
    usersColl.update(u2, { parent: key1 });
  }

  const conn = connectionsColl.firstExample({ _from, _to });

  if (level != "reported") {
    // clear reportReason for levels other than reported
    reportReason = null;
  }
  if (level != "reported" || reportReason != "replaced") {
    // clear replacedWith for levels other than reported
    // and reportReason other than replaced
    replacedWith = null;
  }
  if (replacedWith && !usersColl.exists(replacedWith)) {
    throw new errors.UserNotFoundError(replacedWith);
  }

  connectionsHistoryColl.insert({
    _from,
    _to,
    level,
    reportReason,
    replacedWith,
    requestProof,
    timestamp,
  });

  if (!conn) {
    connectionsColl.insert({
      _from,
      _to,
      level,
      reportReason,
      replacedWith,
      requestProof,
      timestamp,
      initTimestamp: timestamp,
    });
  } else {
    connectionsColl.update(conn, {
      level,
      reportReason,
      replacedWith,
      requestProof,
      timestamp,
    });
  }
}

function userConnections(userId, direction = "outbound") {
  checkUserExists(userId);
  let query, resIdAttr;
  if (direction == "outbound") {
    query = { _from: "users/" + userId };
    resIdAttr = "_to";
  } else if (direction == "inbound") {
    query = { _to: "users/" + userId };
    resIdAttr = "_from";
  }
  return connectionsColl
    .byExample(query)
    .toArray()
    .map((conn) => {
      const id = conn[resIdAttr].replace("users/", "");
      return {
        id,
        level: conn.level,
        reportReason: conn.reportReason,
        timestamp: conn.timestamp,
      };
    });
}

function groupMembers(groupId) {
  return usersInGroupsColl
    .byExample({
      _to: "groups/" + groupId,
    })
    .toArray()
    .map((e) => e._from.replace("users/", ""));
}

function userMemberships(userId) {
  checkUserExists(userId);
  return usersInGroupsColl
    .byExample({
      _from: "users/" + userId,
    })
    .toArray()
    .map((ug) => {
      return {
        id: ug._to.replace("groups/", ""),
        timestamp: ug.timestamp,
      };
    });
}

function userInvites(userId) {
  checkUserExists(userId);
  return invitationsColl
    .byExample({
      _from: "users/" + userId,
    })
    .toArray()
    .filter((invite) => {
      return Date.now() - invite.timestamp < 86400000;
    })
    .map((invite) => {
      const groupId = invite._to.replace("groups/", "");
      return {
        group: groupId,
        inviter: invite.inviter,
        invitee: userId,
        id: hash(groupId + invite.inviter + userId + invite.timestamp),
        data: invite.data,
        timestamp: invite.timestamp,
      };
    });
}

function invite(inviter, invitee, groupId, data, timestamp) {
  const group = getGroup(groupId);
  if (!group.admins || !group.admins.includes(inviter)) {
    throw new errors.NotAdminError();
  }

  if (group.type == "family") {
    checkJoiningFamily(groupId, invitee);
  }

  invitationsColl.removeByExample({
    _from: "users/" + invitee,
    _to: "groups/" + groupId,
  });
  invitationsColl.insert({
    _from: "users/" + invitee,
    _to: "groups/" + groupId,
    inviter,
    data,
    timestamp,
  });
}

function dismiss(dismisser, dismissee, groupId, timestamp) {
  const group = getGroup(groupId);
  if (!group.admins || !group.admins.includes(dismisser)) {
    throw new errors.NotAdminError();
  }
  deleteMembership(groupId, dismissee, timestamp);
}

function getUser(id) {
  if (!usersColl.exists(id)) {
    throw new errors.UserNotFoundError(id);
  }
  return usersColl.document(id);
}
const checkUserExists = getUser;

function createUser(key, timestamp) {
  if (!usersColl.exists(key)) {
    return usersColl.insert({
      signingKeys: [urlSafeB64ToB64(key)],
      createdAt: timestamp,
      _key: key,
    });
  } else {
    return usersColl.document(key);
  }
}

function familyGroup(key) {
  return query`
    FOR ug IN ${usersInGroupsColl}
      FILTER ug._from == ${"users/" + key}
      FOR group in ${groupsColl}
        FILTER group._id == ug._to
        && group.type == 'family'
        && group.head NOT IN [null, ${key}]
      RETURN group
  `.toArray()[0];
}

function createGroup(groupId, key, url, type, timestamp) {
  if (groupsColl.exists(groupId)) {
    throw new errors.DuplicateGroupError();
  }

  const group = {
    _key: groupId,
    admins: [key],
    url,
    type,
    timestamp,
  };

  if (type == "family") {
    if (familyGroup(key)) {
      throw new errors.AlreadyIsFamilyMember(key);
    }
    group.head = null;
    group.vouchers = [];
  }

  groupsColl.insert(group);
  // Add the creator to the group now.
  addUserToGroup(groupId, key, timestamp);
}

function addAdmin(key, admin, groupId) {
  const group = getGroup(groupId);
  if (!group.admins || !group.admins.includes(key)) {
    throw new errors.NotAdminError();
  }
  if (
    !usersInGroupsColl.firstExample({
      _from: "users/" + admin,
      _to: "groups/" + groupId,
    })
  ) {
    throw new errors.IneligibleNewAdminError();
  }
  group.admins.push(admin);
  groupsColl.update(group, { admins: group.admins });
}

function addUserToGroup(groupId, key, timestamp) {
  const _from = "users/" + key;
  const _to = "groups/" + groupId;

  const edge = usersInGroupsColl.firstExample({ _from, _to });
  if (!edge) {
    usersInGroupsColl.insert({ _from, _to, timestamp });
  } else {
    usersInGroupsColl.update(edge, { timestamp });
  }
  // empty the group's vouchers after family group member changes
  const group = groupsColl.document(groupId);
  if (group.type == "family") {
    groupsColl.update(group, { vouchers: [] });
  }
}

function knownConnections(userId) {
  return query`
    FOR conn in ${connectionsColl}
      FILTER conn._from == ${"users/" + userId}
      && conn.level IN ['already known', 'recovery']
      FOR conn2 in ${connectionsColl}
        FILTER conn2._from == conn._to
        && conn2._to == conn._from
        && conn2.level IN ['already known', 'recovery']
      RETURN conn._to
  `
    .toArray()
    .map((id) => id.replace("users/", ""));
}

function checkJoiningFamily(groupId, userId) {
  if (familyGroup(userId)) {
    throw new errors.AlreadyIsFamilyMember(userId);
  }
  const members = groupMembers(groupId);
  const conns = knownConnections(userId);
  // if some of group members are unknown
  if (_.intersection(members, conns).length != members.length) {
    throw new errors.IneligibleFamilyMember(userId);
  }
}

function addMembership(groupId, key, timestamp) {
  const group = getGroup(groupId);
  const invite = invitationsColl.firstExample({
    _from: "users/" + key,
    _to: "groups/" + groupId,
  });
  // invites will expire after 72 hours
  if (!invite || timestamp - invite.timestamp >= 259200000) {
    throw new errors.NotInvitedError();
  }
  // remove invite after joining to not allow reusing that
  invitationsColl.remove(invite);

  if (group.type == "family") {
    checkJoiningFamily(groupId, key);
  }
  addUserToGroup(groupId, key, timestamp);
}

function deleteGroup(groupId, key, timestamp) {
  const group = getGroup(groupId);
  if (group.admins.indexOf(key) < 0) {
    throw new errors.NotAdminError();
  }

  invitationsColl.removeByExample({ _to: "groups/" + groupId });
  usersInGroupsColl.removeByExample({ _to: "groups/" + groupId });
  groupsColl.remove(group);
}

function deleteMembership(groupId, key, timestamp) {
  const group = getGroup(groupId);
  if (group.admins && group.admins.includes(key)) {
    const admins = group.admins.filter((admin) => key != admin);
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
  if (group.type == "family") {
    if (group.head == key) {
      groupsColl.update(group, { head: null, vouchers: [] });
    } else {
      groupsColl.update(group, { vouchers: [] });
    }
  }
}

function getCachedParams(pub) {
  const d = cachedParamsColl.firstExample({ public: pub });
  if (!d) {
    throw new errors.CachedParamsNotFound();
  }
  return d;
}

function getApp(app) {
  if (!appsColl.exists(app)) {
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
    verifications:
      app.verifications && app.verifications.length > 0
        ? app.verifications
        : [app.verification],
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
    soulbound: app.soulbound,
    callbackUrl: app.callbackUrl,
  };
}

function userVerifications(userId) {
  checkUserExists(userId);
  let verifications;
  if (variablesColl.exists("VERIFICATIONS_HASHES")) {
    let hashes = variablesColl.document("VERIFICATIONS_HASHES").hashes;
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

    // rollback consensus-based block selection temporarily to ensure faster verification
    const block = Math.max(
      ...Object.keys(hashes).map((block) => parseInt(block))
    );
    verifications = verificationsColl
      .byExample({ user: userId, block })
      .toArray();
  } else {
    verifications = verificationsColl.byExample({ user: userId }).toArray();
  }
  verifications.forEach((v) => {
    delete v._key;
    delete v._id;
    delete v._rev;
    delete v.user;
  });
  return verifications.filter((v) => !v.expression);
}

function getRecoveryPeriods(allConnections, user, now) {
  const recoveryPeriods = [];
  const history = allConnections.filter((c) => c.id == user);
  let open = false;
  let period = {};
  for (let i = 0; i < history.length; i++) {
    if (history[i].level == "recovery" && !open) {
      open = true;
      period["start"] = history[i].timestamp;
    } else if (history[i].level != "recovery" && open) {
      period["end"] = history[i].timestamp;
      recoveryPeriods.push(period);
      period = {};
      open = false;
    }
  }
  if (open) {
    period["end"] = now;
    recoveryPeriods.push(period);
  }
  return recoveryPeriods;
}

function isActiveRecovery(recoveryPeriods, firstDayBorder, aWeek, aWeekBorder) {
  // a user is an active recovery connection if there is a period that
  // is not closed yet or closed in recent 7 days,
  // and the period was more 7 days long or started in the first day
  for (const period of recoveryPeriods) {
    if (
      period.end > aWeekBorder &&
      (period.end - period.start > aWeek || period.start < firstDayBorder)
    ) {
      return true;
    }
  }
  return false;
}

function getActiveAfter(recoveryPeriods, firstDayBorder, aWeek, now) {
  // a user will become an active recovery connection if
  // it is in recovery level just now but the period is not 7 days long yet
  // and not started in the first day
  const lastPeriod = recoveryPeriods[recoveryPeriods.length - 1];
  if (
    lastPeriod.end == now &&
    lastPeriod.end - lastPeriod.start < aWeek &&
    lastPeriod.start > firstDayBorder
  ) {
    return aWeek - (lastPeriod.end - lastPeriod.start);
  }
  return 0;
}

function getActiveBefore(
  recoveryPeriods,
  firstDayBorder,
  aWeek,
  aWeekBorder,
  now
) {
  // an active recovery connection will become inactive if
  // it's an active recovery connection now but is not in recovery level anymore
  for (const period of recoveryPeriods) {
    if (
      period.end > aWeekBorder &&
      (period.end - period.start > aWeek || period.start < firstDayBorder)
    ) {
      if (period.end == now) {
        // if it's not in recovery level now
        return 0;
      } else {
        return period.end - aWeekBorder;
      }
    }
  }
  return 0;
}

function getRecoveryConnections(userId) {
  const res = [];
  const allConnections = connectionsHistoryColl
    .byExample({
      _from: "users/" + userId,
    })
    .toArray()
    .map((c) => {
      return {
        id: c._to.replace("users/", ""),
        level: c.level,
        timestamp: c.timestamp,
      };
    });
  allConnections.sort((c1, c2) => c1.timestamp - c2.timestamp);
  const recoveryConnections = allConnections.filter(
    (conn) => conn.level == "recovery"
  );
  if (recoveryConnections.length == 0) {
    return res;
  }

  const now = Date.now();
  const firstDayBorder = recoveryConnections[0].timestamp + 24 * 60 * 60 * 1000;
  const aWeek = 7 * 24 * 60 * 60 * 1000;
  const aWeekBorder = Date.now() - aWeek;
  // find all users that were selected as recovery in user's connection history
  const recoveryIds = new Set(recoveryConnections.map((conn) => conn.id));

  // 1) New recovery connections can participate in resetting signing key,
  //    one week after being set as recovery connection. This limit is not
  //    applied to recovery connections that users set for the first time.
  // 2) Removed recovery connections can continue participating in resetting
  //    signing key, for one week after being removed from recovery connections
  for (let id of recoveryIds) {
    // find the periods that this user was recovery
    const recoveryPeriods = getRecoveryPeriods(allConnections, id, now);
    // find if this user is an active recovery connection
    const isActive = isActiveRecovery(
      recoveryPeriods,
      firstDayBorder,
      aWeek,
      aWeekBorder
    );
    // for not active recovery connections, find how long it takes to be activated
    const activeAfter = isActive
      ? 0
      : getActiveAfter(recoveryPeriods, firstDayBorder, aWeek, now);
    // for active recovery connections, find how long it takes to be inactivated
    const activeBefore = isActive
      ? getActiveBefore(
          recoveryPeriods,
          firstDayBorder,
          aWeek,
          aWeekBorder,
          now
        )
      : 0;

    if (isActive || activeAfter > 0 || activeBefore > 0) {
      res.push({ id, isActive, activeBefore, activeAfter });
    }
  }
  return res;
}

function setSigningKey(signingKey, key, timestamp) {
  usersColl.update(key, {
    signingKeys: [signingKey],
    updateTime: timestamp,
  });
}

function getSponsorship(appUserId) {
  const sponsorship = sponsorshipsColl.firstExample({ appId: appUserId });
  if (!sponsorship) {
    throw new errors.AppUserIdNotFoundError(appUserId);
  }
  return sponsorship;
}

function isSponsored(key) {
  return sponsorshipsColl.firstExample({ _from: "users/" + key }) != null;
}

function unusedSponsorships(app) {
  const usedSponsorships = sponsorshipsColl
    .byExample({
      _to: "apps/" + app,
    })
    .count();
  const { totalSponsorships } = appsColl.document(app);
  return totalSponsorships - usedSponsorships;
}

function sponsor(op) {
  if (op.name == "Sponsor" && unusedSponsorships(op.app) < 1) {
    throw new errors.UnusedSponsorshipsError(op.app);
  }

  const { idsAsHex } = appsColl.document(op.app);
  if (idsAsHex) {
    if (!isEthereumAddress(op.appUserId)) {
      throw new errors.InvalidAppUserIdError(op.appUserId);
    }
    op.appUserId = op.appUserId.toLowerCase();
  }
  const sponsorship = sponsorshipsColl.firstExample({ appId: op.appUserId });
  if (!sponsorship) {
    sponsorshipsColl.insert({
      _from: "users/0",
      _to: "apps/" + op.app,
      // it will expire after 1 hour
      expireDate: Math.ceil(Date.now() / 1000 + 60 * 60),
      appId: op.appUserId,
      appHasAuthorized: op.name == "Sponsor" ? true : false,
      spendRequested: op.name == "Spend Sponsorship" ? true : false,
      timestamp: op.timestamp,
    });
    return;
  }

  if (sponsorship.appHasAuthorized && sponsorship.spendRequested) {
    throw new errors.SponsoredBeforeError();
  }

  if (op.name == "Sponsor" && sponsorship.appHasAuthorized) {
    throw new errors.AppAuthorizedBeforeError();
  }

  if (op.name == "Spend Sponsorship" && sponsorship.spendRequested) {
    throw new errors.SpendRequestedBeforeError();
  }

  sponsorshipsColl.update(sponsorship, {
    expireDate: null,
    appHasAuthorized: true,
    spendRequested: true,
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

function insertAppUserIdVerification(
  app,
  uid,
  appUserId,
  verification,
  roundedTimestamp
) {
  const d = appIdsColl.firstExample({ uid });
  if (d) {
    throw new errors.DuplicateUIDError(uid);
  }

  const { idsAsHex } = appsColl.document(app);
  if (idsAsHex) {
    if (!isEthereumAddress(appUserId)) {
      throw new errors.InvalidAppUserIdError(appUserId);
    }
    appUserId = appUserId.toLowerCase();
  }
  appIdsColl.insert({
    app,
    uid,
    appId: appUserId,
    verification,
    roundedTimestamp,
  });
}

function getState() {
  const lastProcessedBlock = variablesColl.document("LAST_BLOCK").value;
  const verificationsBlock = variablesColl.document("VERIFICATION_BLOCK").value;
  const initOp = operationsColl.byExample({ state: "init" }).count();
  const sentOp = operationsColl.byExample({ state: "sent" }).count();
  const verificationsHashes = JSON.parse(
    variablesColl.document("VERIFICATIONS_HASHES").hashes
  );
  const conf = module.context.configuration;
  const consensusSenderAddress = getConsensusSenderAddress();
  const { privateKey: ethPrivateKey } = getEthKeyPair();
  const { publicKey: naclSigningKey } = getNaclKeyPair();
  let wISchnorrPublic = null;
  if (conf.wISchnorrPassword || conf.seed) {
    const server = new wISchnorrServer();
    server.GenerateSchnorrKeypair(conf.wISchnorrPassword || conf.seed);
    wISchnorrPublic = server.ExtractPublicKey();
  }
  return {
    lastProcessedBlock,
    verificationsBlock,
    initOp,
    sentOp,
    verificationsHashes,
    wISchnorrPublic,
    ethSigningAddress: priv2addr(ethPrivateKey),
    naclSigningKey,
    consensusSenderAddress,
    development: conf.development,
    version: module.context.manifest.version,
  };
}

function getGroup(groupId) {
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  return groupsColl.document(groupId);
}

function groupInvites(groupId) {
  return invitationsColl
    .byExample({
      _to: "groups/" + groupId,
    })
    .toArray()
    .filter((invite) => {
      // invites will expire after 72 hours
      return Date.now() - invite.timestamp < 259200000;
    })
    .map((invite) => {
      const invitee = invite._from.replace("users/", "");
      return {
        group: groupId,
        inviter: invite.inviter,
        invitee,
        id: hash(groupId + invite.inviter + invitee + invite.timestamp),
        data: invite.data,
        timestamp: invite.timestamp,
      };
    });
}

function updateGroup(admin, groupId, url, timestamp) {
  const group = getGroup(groupId);
  if (!group.admins || !group.admins.includes(admin)) {
    throw new errors.NotAdminError();
  }
  groupsColl.update(group, {
    url,
    timestamp,
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
  signingKeys = signingKeys.filter((s) => s != signingKey);
  usersColl.update(id, { signingKeys });
}

function removeAllSigningKeys(userId, signingKey) {
  let signingKeys = usersColl.document(userId).signingKeys || [];
  signingKeys = signingKeys.filter((s) => s == signingKey);
  usersColl.update(userId, { signingKeys });
}

function vouchFamily(userId, groupId, timestamp) {
  const group = getGroup(groupId);
  if (group.type != "family") {
    throw new errors.NotFamilyError();
  }

  // users can start vouching only after setting the head
  if (!group.head) {
    throw new errors.IneligibleToVouch();
  }

  const members = groupMembers(groupId);
  const conns = knownConnections(userId);
  // if some of group members are unknown to voucher
  if (_.intersection(members, conns).length != members.length) {
    throw new errors.IneligibleToVouchFor();
  }

  group.vouchers.push(userId);
  groupsColl.update(group, { vouchers: group.vouchers });
}

function userFamiliesToVouch(userId) {
  checkUserExists(userId);
  const result = [];
  const conns = knownConnections(userId);
  const connIds = conns.map((key) => `users/${key}`);
  const candidates = query`
    FOR ug in ${usersInGroupsColl}
      FILTER ug._from IN ${connIds}
      FOR group in ${groupsColl}
        FILTER group._id == ug._to
        && group.type == 'family'
        && group.head != null
      RETURN DISTINCT group
  `.toArray();
  return candidates
    .filter((group) => {
      const members = groupMembers(group._key);
      return (
        !group.vouchers.includes(userId) &&
        members.length >= 2 &&
        groupInvites(group._key).length == 0 &&
        _.intersection(members, conns).length == members.length
      );
    })
    .map((group) => group._key);
}

function setFamilyHead(admin, head, groupId) {
  const group = getGroup(groupId);
  if (!groupMembers(groupId).includes(head)) {
    throw new errors.IneligibleFamilyHead();
  }
  if (familyGroup(group.head)) {
    throw new errors.HeadAlreadyIsFamilyMember();
  }
  if (!group.admins.includes(admin)) {
    throw new errors.NotAdminError();
  }
  // update head and empty the group's vouchers
  groupsColl.update(group, { head, vouchers: [] });
}

function convertToFamily(admin, head, groupId) {
  const group = getGroup(groupId);
  if (group.type == "family") {
    throw new errors.AlreadyIsFamilyError();
  }

  if (!group.admins.includes(admin)) {
    throw new errors.NotAdminError();
  }

  const members = groupMembers(groupId);
  if (!members.includes(head)) {
    throw new errors.IneligibleFamilyHead();
  }

  for (const member of members) {
    if (member != head && familyGroup(member)) {
      throw new errors.AlreadyIsFamilyMember(member);
    }
    const conns = knownConnections(member);
    // if some of group members are unknown
    const temp = members.filter((m) => m != member);
    if (_.intersection(temp, conns).length != temp.length) {
      throw new errors.IneligibleFamilyMember(member);
    }
  }
  groupsColl.update(group, { head, type: "family", vouchers: [] });
}

function isEthereumAddress(address) {
  const re = new RegExp(/^0[xX][A-Fa-f0-9]{40}$/);
  return re.test(address);
}

function getAppUserIds(appKey, activeOnly, countOnly) {
  const app = getApp(appKey);
  const res = [];
  let query = { app: app._key };
  if (activeOnly) {
    const vel = app.verificationExpirationLength;
    query["roundedTimestamp"] = vel ? parseInt(Date.now() / vel) * vel : 0;
  }
  for (const verification of app.verifications) {
    query["verification"] = verification;
    const appUserIds = appIdsColl
      .byExample(query)
      .toArray()
      .map((d) => d.appId);
    const data = {
      verification,
      count: appUserIds.length,
    };
    if (!countOnly) {
      data["appUserIds"] = appUserIds;
    }
    res.push(data);
  }
  return res;
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
  userMemberships,
  userInvites,
  userVerifications,
  userFamiliesToVouch,
  checkUserExists,
  getUser,
  createUser,
  groupMembers,
  getApp,
  getApps,
  appToDic,
  sponsor,
  isSponsored,
  getSponsorship,
  loadOperation,
  upsertOperation,
  insertAppUserIdVerification,
  setSigningKey,
  unusedSponsorships,
  getState,
  getRecoveryConnections,
  addSigningKey,
  removeSigningKey,
  removeAllSigningKeys,
  getGroup,
  groupInvites,
  updateGroup,
  getCachedParams,
  vouchFamily,
  setFamilyHead,
  convertToFamily,
  isEthereumAddress,
  getAppUserIds,
};
