"use strict";
const { sha256 } = require("@arangodb/crypto");
const { query, db, aql } = require("@arangodb");
const _ = require("lodash");
const stringify = require("fast-json-stable-stringify");
const nacl = require("tweetnacl");
const {
  urlSafeB64ToB64,
  priv2addr,
  getNaclKeyPair,
  getEthKeyPair,
  getConsensusSenderAddress,
  recoverEthSigner,
} = require("./encoding");
const errors = require("./errors");

const connectionsColl = db._collection("connections");
const connectionsHistoryColl = db._collection("connectionsHistory");
const groupsColl = db._collection("groups");
const usersInGroupsColl = db._collection("usersInGroups");
const usersColl = db._collection("users");
const contextsColl = db._collection("contexts");
const appsColl = db._collection("apps");
const sponsorshipsColl = db._collection("sponsorships");
const operationsColl = db._collection("operations");
const invitationsColl = db._collection("invitations");
const verificationsColl = db._collection("verifications");
const variablesColl = db._collection("variables");
const testblocksColl = db._collection("testblocks");

function addConnection(key1, key2, timestamp) {
  // this function is deprecated and will be removed on v6
  connect({ id1: key1, id2: key2, timestamp });
  connect({ id1: key2, id2: key1, timestamp });
}

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

  const _from = "users/" + key1;
  const _to = "users/" + key2;
  if (level == "recovery") {
    const tf = connectionsColl.firstExample({ _from: _to, _to: _from });
    if (!tf || !["already known", "recovery"].includes(tf.level)) {
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
  if (replacedWith && !loadUser(replacedWith)) {
    throw new errors.UserNotFoundError(replacedWith);
  }
  if (!level) {
    // Set 'just met' as confidence level when old addConnection is called
    // and there was no other level set directly using Connect
    // this if should be removed when v5 dropped and "Add Connection" operation removed
    level = conn ? conn.level : "just met";
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

function removeConnection(reporter, reported, reportReason, timestamp) {
  // this function is deprecated and will be removed on v6
  connect({
    id1: reporter,
    id2: reported,
    level: "reported",
    reportReason,
    timestamp,
  });
}

function userConnections(userId, direction = "outbound") {
  let query, resIdAttr;
  if (direction == "outbound") {
    query = { _from: "users/" + userId };
    resIdAttr = "_to";
  } else {
    query = { _to: "users/" + userId };
    resIdAttr = "_from";
  }
  return connectionsColl
    .byExample(query)
    .toArray()
    .map((conn) => {
      return {
        id: conn[resIdAttr].replace("users/", ""),
        level: conn.level,
        reportReason: conn.reportReason || undefined,
        timestamp: conn.timestamp,
      };
    });
}

function userToDic(userId) {
  const u = usersColl.document("users/" + userId);
  return {
    id: u._key,
    // all signing keys will be returned on v6
    signingKey: u.signingKeys[0],
    // score is deprecated and will be removed on v6
    score: u.score,
    verifications: userVerifications(u._key).map((v) => v.name),
    hasPrimaryGroup: hasPrimaryGroup(u._key),
    // trusted is deprecated and will be replaced by recoveryConnections on v6
    trusted: getRecoveryConnections(u._key),
    // flaggers is deprecated and will be replaced by reporters on v6
    flaggers: getReporters(u._key),
    createdAt: u.createdAt,
    // eligible_groups is deprecated and will be removed on v6
    eligible_groups: u.eligible_groups || [],
  };
}

function getReporters(user) {
  const reporters = {};
  connectionsColl
    .byExample({
      _to: "users/" + user,
      level: "reported",
    })
    .toArray()
    .forEach((c) => {
      reporters[c._from.replace("users/", "")] = c.reportReason;
    });
  return reporters;
}

function groupMembers(groupId) {
  return usersInGroupsColl
    .byExample({
      _to: "groups/" + groupId,
    })
    .toArray()
    .map((e) => e._from.replace("users/", ""));
}

// this function is deprecated and will be removed on v6
function updateEligibleGroups(userId, connections, currentGroups) {
  connections = connections.map((uId) => "users/" + uId);
  currentGroups = currentGroups.map((gId) => "groups/" + gId);
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
  const groupIds = candidates.map((x) => x.group);
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

  groupCounts.map(function (row) {
    groupCountsDic[row.id] = row.count;
  });

  const eligible_groups = candidates
    .filter((g) => g.count * 2 >= groupCountsDic[g.group])
    .map((g) => g.group.replace("groups/", ""));
  usersColl.update(userId, {
    eligible_groups,
    eligible_timestamp: Date.now(),
  });
  return eligible_groups;
}

// this function is deprecated and will be removed on v6
function updateEligibles(groupId) {
  const members = groupMembers(groupId);
  const neighbors = [];
  const isKnown = (c) =>
    ["just met", "already known", "recovery"].includes(c.level);

  members.forEach((member) => {
    const conns = connectionsColl
      .byExample({
        _from: "users/" + member,
      })
      .toArray()
      .filter(isKnown)
      .map((c) => c._to.replace("users/", ""))
      .filter((u) => !members.includes(u));
    neighbors.push(...conns);
  });

  const counts = {};
  for (let neighbor of neighbors) {
    counts[neighbor] = (counts[neighbor] || 0) + 1;
  }
  const eligibles = Object.keys(counts).filter((neighbor) => {
    return counts[neighbor] >= members.length / 2;
  });
  // storing eligible groups on users documents and updating them
  // from this route will be removed when clients updated to use
  // new GET /groups/{id} result to show eligibles in invite list
  eligibles.forEach((neighbor) => {
    let { eligible_groups } = usersColl.document(neighbor);
    eligible_groups = eligible_groups || [];
    if (eligible_groups.indexOf(groupId) == -1) {
      eligible_groups.push(groupId);
      usersColl.update(neighbor, {
        eligible_groups,
      });
    }
  });
  return eligibles;
}

function groupToDic(groupId) {
  const group = groupsColl.document("groups/" + groupId);
  return {
    id: group._key,
    members: groupMembers(group._key),
    type: group.type || "general",
    founders: (group.founders || []).map((founder) =>
      founder.replace("users/", "")
    ),
    admins: group.admins || group.founders,
    isNew: group.isNew,
    // score on group is deprecated and will be removed on v6
    score: 0,
    url: group.url,
    timestamp: group.timestamp,
  };
}

function userGroups(userId) {
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

function userInvitedGroups(userId) {
  return invitationsColl
    .byExample({
      _from: "users/" + userId,
    })
    .toArray()
    .filter((invite) => {
      return Date.now() - invite.timestamp < 86400000;
    })
    .map((invite) => {
      let group = groupToDic(invite._to.replace("groups/", ""));
      group.inviter = invite.inviter;
      group.inviteId = invite._key;
      group.data = invite.data;
      group.invited = invite.timestamp;
      return group;
    });
}

function invite(inviter, invitee, groupId, data, timestamp) {
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
  if (!group.admins || !group.admins.includes(inviter)) {
    throw new errors.NotAdminError();
  }
  if (group.type == "primary" && hasPrimaryGroup(invitee)) {
    throw new errors.AlreadyHasPrimaryGroupError();
  }
  if (group.isNew && !group.founders.includes(invitee)) {
    throw new errors.NewUserBeforeFoundersJoinError();
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
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
  if (!group.admins || !group.admins.includes(dismisser)) {
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
      _key: key,
    });
  } else {
    return user;
  }
}

function hasPrimaryGroup(key) {
  const groupIds = usersInGroupsColl
    .byExample({
      _from: "users/" + key,
    })
    .toArray()
    .map((ug) => ug._to.replace("groups/", ""));
  const groups = groupsColl.documents(groupIds).documents;
  return groups.filter((group) => group.type == "primary").length > 0;
}

function createGroup(
  groupId,
  key1,
  key2,
  inviteData2,
  key3,
  inviteData3,
  url,
  type,
  timestamp
) {
  if (!["general", "primary"].includes(type)) {
    throw new errors.InvalidGroupTypeError(type);
  }

  if (groupsColl.exists(groupId)) {
    throw new errors.DuplicateGroupError();
  }

  const conns = connectionsColl
    .byExample({
      _to: "users/" + key1,
    })
    .toArray()
    .map((u) => u._from.replace("users/", ""));
  if (conns.indexOf(key2) < 0 || conns.indexOf(key3) < 0) {
    throw new errors.InvalidCoFoundersError();
  }

  const founders = [key1, key2, key3].sort();
  if (type == "primary" && founders.some(hasPrimaryGroup)) {
    throw new errors.AlreadyHasPrimaryGroupError();
  }

  groupsColl.insert({
    _key: groupId,
    score: 0,
    isNew: true,
    admins: founders,
    url,
    type,
    timestamp,
    founders,
  });

  // Add the creator and invite other cofounders to the group now.
  // The other two "co-founders" have to join using /membership
  addUserToGroup(groupId, key1, timestamp);
  invite(key1, key2, groupId, inviteData2, timestamp);
  invite(key1, key3, groupId, inviteData3, timestamp);
}

function addAdmin(key, admin, groupId) {
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  if (
    !usersInGroupsColl.firstExample({
      _from: "users/" + admin,
      _to: "groups/" + groupId,
    })
  ) {
    throw new errors.IneligibleNewAdminError();
  }
  const group = groupsColl.document(groupId);
  if (!group.admins || !group.admins.includes(key)) {
    throw new errors.NotAdminError();
  }
  group.admins.push(admin);
  groupsColl.update(group, { admins: group.admins });
}

function addUserToGroup(groupId, key, timestamp) {
  const user = "users/" + key;
  const group = "groups/" + groupId;

  const edge = usersInGroupsColl.firstExample({
    _from: user,
    _to: group,
  });
  if (!edge) {
    usersInGroupsColl.insert({
      _from: user,
      _to: group,
      timestamp,
    });
  } else {
    usersInGroupsColl.update(edge, { timestamp });
  }
}

function addMembership(groupId, key, timestamp) {
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }

  const group = groupsColl.document(groupId);
  if (group.isNew && !group.founders.includes(key)) {
    throw new errors.NewUserBeforeFoundersJoinError();
  }

  if (group.type == "primary" && hasPrimaryGroup(key)) {
    throw new errors.AlreadyHasPrimaryGroupError();
  }

  const invite = invitationsColl.firstExample({
    _from: "users/" + key,
    _to: "groups/" + groupId,
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
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }

  const group = groupsColl.document(groupId);
  if (group.admins.indexOf(key) < 0) {
    throw new errors.NotAdminError();
  }

  invitationsColl.removeByExample({ _to: "groups/" + groupId });
  usersInGroupsColl.removeByExample({ _to: "groups/" + groupId });
  groupsColl.remove(group);
}

function deleteMembership(groupId, key, timestamp) {
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
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
}

function getContext(context) {
  if (!contextsColl.exists(context)) {
    throw new errors.ContextNotFoundError(context);
  }
  return contextsColl.document(context);
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
    verification: app.verification,
    verificationUrl: app.verificationUrl,
    logo: app.logo,
    url: app.url,
    assignedSponsorships: app.totalSponsorships,
    unusedSponsorships: app.totalSponsorships - (app.usedSponsorships || 0),
    testing: app.testing,
    soulbound: app.soulbound,
    soulboundMessage: app.context ? getContext(app.context).soulboundMessage || '' : '',
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

function getLastContextIds(appKey, countOnly) {
  const { context, verification } = getApp(appKey);
  const { collection } = getContext(context);
  const coll = db._collection(collection);

  const baseQuery = aql`
    FOR c IN ${coll}
      FOR v in verifications
        FILTER v.user == c.user
          AND v.expression == true
          AND v.name == ${verification}
        FOR s IN ${sponsorshipsColl}
          FILTER s._from == CONCAT("users/", c.user) OR (s.appId == c.contextId AND s.appHasAuthorized AND s.spendRequested)
  `;
  const data = {};
  if (countOnly) {
    data["count"] = db
      ._query(
        aql`
      ${baseQuery}
      COLLECT user = c.user
      COLLECT WITH COUNT INTO length
      RETURN length
    `
      )
      .toArray()[0];
  } else {
    data["contextIds"] = db
      ._query(
        aql`
      ${baseQuery}
      SORT c.timestamp DESC
      COLLECT user = c.user INTO contextIds = c.contextId
      RETURN contextIds[0]
    `
      )
      .toArray();
    data["count"] = data["contextIds"].length;
  }
  return data;
}

function userVerifications(user) {
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

  // rollback consneus based block selection consneus temporarily to ensure faster verification
  let block = Math.max(...Object.keys(hashes));

  const verifications = verificationsColl.byExample({ user, block }).toArray();
  verifications.forEach((v) => {
    delete v._key;
    delete v._id;
    delete v._rev;
    delete v.user;
  });

  // replace expression based verification with app based ones
  getApps().forEach((app) => {
    const v = verifications.find(
      (v) => v.expression && app.verification == v.name
    );
    if (v) {
      verifications.push({
        app: true,
        name: app._key,
        timestamp: v.timestamp,
        block: v.block,
      });
    }
  });
  return verifications.filter((v) => !v.expression);
}

function linkContextId(id, context, contextId, timestamp) {
  const { collection, idsAsHex, soulbound, soulboundMessage } =
    getContext(context);

  if (!loadUser(id)) {
    throw new errors.UserNotFoundError(id);
  }

  if (!contextId) {
    throw new errors.InvalidContextIdError(contextId);
  }

  if (soulboundMessage) {
    if (!isEthereumSignature(contextId)) {
      throw new errors.InvalidContextIdError(contextId);
    }
    contextId = recoverEthSigner(contextId, soulboundMessage);
  } else if (idsAsHex) {
    if (!isEthereumAddress(contextId)) {
      throw new errors.InvalidContextIdError(contextId);
    }
    contextId = contextId.toLowerCase();
  } else if (soulbound) {
    if (contextId.length > 32) {
      throw new errors.InvalidContextIdError(contextId);
    }
  }

  // remove testblocks if exists
  removeTestblock(contextId, "link");

  const coll = db._collection(collection);
  let user = getUserByContextId(coll, contextId);
  if (user && user != id) {
    throw new errors.DuplicateContextIdError(contextId);
  }

  const links = coll.byExample({ user: id }).toArray();
  const recentLinks = links.filter(
    (link) => timestamp - link.timestamp < 24 * 3600 * 1000
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
    timestamp,
  });
}

function setRecoveryConnections(conns, key, timestamp) {
  // this function is deprecated and will be removed on v6
  conns.forEach((conn) => {
    connect({
      id1: key,
      id2: conn,
      level: "recovery",
      timestamp,
    });
  });
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

function getRecoveryConnections(user) {
  const res = [];
  const allConnections = connectionsHistoryColl
    .byExample({
      _from: "users/" + user,
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
  const recoveryIds = new Set(recoveryConnections.map((conn) => conn.id));

  // 1) New recovery connections can participate in resetting signing key,
  //    one week after being set as recovery connection. This limit is not
  //    applied to recovery connections that users set for the first time.
  // 2) Removed recovery connections can continue participating in resetting
  //    signing key, for one week after being removed from recovery connections
  for (let id of recoveryIds) {
    // find the periods that this user was recovery
    const recoveryPeriods = getRecoveryPeriods(allConnections, id, now);
    // find this user is recovery now
    for (const period of recoveryPeriods) {
      if (
        period.end > aWeekBorder &&
        (period.end - period.start > aWeek || period.start < firstDayBorder)
      ) {
        res.push(id);
      }
    }
  }
  return res;
}

function setSigningKey(signingKey, key, timestamp) {
  usersColl.update(key, {
    signingKeys: [signingKey],
    updateTime: timestamp,
  });

  // remove pending invites, because they can not be decrypted anymore by the new signing key
  invitationsColl.removeByExample({
    _from: "users/" + key,
  });
}

function isSponsored(key) {
  return sponsorshipsColl.firstExample({ _from: "users/" + key }) != null;
}

function getSponsorship(contextId) {
  const sponsorship = sponsorshipsColl.firstExample({ appId: contextId });
  if (!sponsorship) {
    throw new errors.NotSponsoredError(contextId);
  }
  return sponsorship;
}

function sponsor(op) {
  const app = appsColl.document(op.app);
  if (
    op.name == "Sponsor" &&
    app.totalSponsorships - (app.usedSponsorships || 0) < 1
  ) {
    throw new errors.UnusedSponsorshipsError(op.app);
  }

  if (app.idsAsHex) {
    op.contextId = op.contextId.toLowerCase();
  }
  // remove testblocks if exists
  removeTestblock(op.contextId, "sponsorship", op.app);

  const sponsorship = sponsorshipsColl.firstExample({
    appId: op.contextId,
    _to: "apps/" + op.app,
  });
  if (!sponsorship) {
    sponsorshipsColl.insert({
      _from: "users/0",
      _to: "apps/" + op.app,
      expireDate: Math.ceil(Date.now() / 1000 + 60 * 60),
      appId: op.contextId,
      appHasAuthorized: op.name == "Sponsor",
      spendRequested: op.name == "Spend Sponsorship",
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

  appsColl.update(app, { usedSponsorships: (app.usedSponsorships || 0) + 1 });
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
  const lastProcessedBlock = variablesColl.document("LAST_BLOCK").value;
  const verificationsBlock = variablesColl.document("VERIFICATION_BLOCK").value;
  const initOp = query`
    FOR o in ${operationsColl}
      FILTER o.state == "init"
      COLLECT WITH COUNT INTO length
      RETURN length
  `.toArray()[0];
  const sentOp = query`
    FOR o in ${operationsColl}
      FILTER o.state == "sent"
      COLLECT WITH COUNT INTO length
      RETURN length
  `.toArray()[0];
  const verificationsHashes = JSON.parse(
    variablesColl.document("VERIFICATIONS_HASHES").hashes
  );
  const consensusSenderAddress = getConsensusSenderAddress();
  const { privateKey: ethPrivateKey } = getEthKeyPair();
  const { publicKey: naclSigningKey } = getNaclKeyPair();
  return {
    lastProcessedBlock,
    verificationsBlock,
    initOp,
    sentOp,
    verificationsHashes,
    ethSigningAddress: priv2addr(ethPrivateKey),
    naclSigningKey,
    consensusSenderAddress,
    version: module.context.manifest.version,
  };
}

function addTestblock(contextId, action, app) {
  testblocksColl.insert({ app, contextId, action, timestamp: Date.now() });
}

function removeTestblock(contextId, action, app) {
  let query;
  if (app) {
    query = { app, contextId, action };
  } else {
    query = { contextId, action };
  }
  testblocksColl.removeByExample(query);
}

function getTestblocks(app, contextId) {
  return testblocksColl
    .byExample({
      app: app,
      contextId: contextId,
    })
    .toArray()
    .map((b) => b.action);
}

function getContextIds(coll) {
  return coll
    .all()
    .toArray()
    .map((c) => {
      return {
        user: c.user,
        contextId: c.contextId,
        timestamp: c.timestamp,
      };
    });
}

function loadGroup(groupId) {
  return query`RETURN DOCUMENT(${groupsColl}, ${groupId})`.toArray()[0];
}

function groupInvites(groupId) {
  return invitationsColl
    .byExample({
      _to: "groups/" + groupId,
    })
    .toArray()
    .filter((invite) => {
      return Date.now() - invite.timestamp < 86400000;
    })
    .map((invite) => {
      return {
        inviter: invite.inviter,
        invitee: invite._from.replace("users/", ""),
        id: invite._key,
        data: invite.data,
        timestamp: invite.timestamp,
      };
    });
}

function removePasscode(contextKey) {
  contextsColl.update(contextKey, {
    passcode: null,
  });
}

function updateGroup(admin, groupId, url, timestamp) {
  if (!groupsColl.exists(groupId)) {
    throw new errors.GroupNotFoundError(groupId);
  }
  const group = groupsColl.document(groupId);
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

function removeAllSigningKeys(id, signingKey) {
  let signingKeys = usersColl.document(id).signingKeys || [];
  signingKeys = signingKeys.filter((s) => s == signingKey);
  usersColl.update(id, { signingKeys });
}

function isEthereumAddress(address) {
  const re = new RegExp(/^0[xX][A-Fa-f0-9]{40}$/);
  return re.test(address);
}

function isEthereumSignature(sig) {
  const re = new RegExp(/^[A-Fa-f0-9]{130}$/);
  return re.test(sig);
}

function sponsorRequestedRecently(op) {
  const lastSponsorTimestamp = query`
    FOR o in ${operationsColl}
      FILTER o.name == "Sponsor"
      AND o.contextId IN ${[op.contextId, op.contextId.toLowerCase()]}
      SORT o.timestamp ASC
      RETURN o.timestamp
  `
    .toArray()
    .pop();

  const timeWindow = module.context.configuration.operationsTimeWindow * 1000;
  return lastSponsorTimestamp && Date.now() - lastSponsorTimestamp < timeWindow;
}

function isSponsoredByContextId(op) {
  const sponsored = query`
    FOR s in ${sponsorshipsColl}
      FILTER s._to == CONCAT("apps/", ${op.app})
      AND s.appHasAuthorized == true
      AND s.spendRequested == true
      AND s.appId IN ${[op.contextId, op.contextId.toLowerCase()]}
      RETURN s.appId
  `
    .toArray()
    .pop();
  if (sponsored) {
    return true;
  }

  return false;
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
  getSponsorship,
  linkContextId,
  loadOperation,
  upsertOperation,
  setRecoveryConnections,
  setSigningKey,
  getLastContextIds,
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
  isEthereumAddress,
  sponsorRequestedRecently,
  isSponsoredByContextId,
};
