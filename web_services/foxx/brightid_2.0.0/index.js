'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const nacl = require('tweetnacl');
const crypto = require('@arangodb/crypto')
const db = require('./db');
const arango = require('@arangodb').db;


const {
  strToUint8Array,
  b64ToUint8Array,
  uInt8ArrayToB64,
  b64ToUrlSafeB64
} = require('./encoding');

const router = createRouter();
module.context.use(router);

function hash(data) {
  const h = crypto.sha256(data);
  const b = Buffer.from(h, 'hex').toString('base64');
  return b64ToUrlSafeB64(b);
}

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

// Consider using this in the schemas below if they ever update joi
// key1: joi.string().base64().required(),

// lowest-level schemas
var schemas = {
  score: joi.number().min(0).max(100).default(0),
  timestamp: joi.number().integer().required()
};

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  user: joi.object({
    id: joi.string().required().description('the user id'),
    score: schemas.score,
    verifications: joi.array().items(joi.string())
  }),
  group: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    score: schemas.score,
    verifications: joi.array().items(joi.string()),
    isNew: joi.boolean().default(true),
    knownMembers: joi.array().items(joi.string()).description('ids of two or three current' +
      ' members connected to the reference user, or if the group is being founded, the co-founders that have joined'),
    founders: joi.array().items(joi.string()).description('ids of the three founders of the group')
  }),
  context: joi.object({
    verification: joi.string().required().description('verification used by the context'),
    verificationUrl: joi.string().required().description('the url to PUT a verification with /:id'),
    isApp: joi.boolean().default(false),
    appLogo: joi.string().description('app logo (base64 encoded image)'),
    appUrl: joi.string().description('the base url for the web app associated with the context'),
  }),
}, schemas);

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({

  connectionsPutBody: joi.object({
    id1: joi.string().required().description('id of the first user'),
    id2: joi.string().required().description('id of the second user'),
    sig1: joi.string().required()
      .description('message (id1 + id2 + timestamp) signed by the user represented by id1'),
    sig2: joi.string().required()
      .description('message (id1 + id2 + timestamp) signed by the user represented by id2'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the connection occurred')
  }),

  connectionsDeleteBody: joi.object({
    id1: joi.string().required().description('id of the user removing the connection'),
    id2: joi.string().required().description('id of the second user'),
    sig1: joi.string().required()
      .description('message (id1 + id2 + timestamp) signed by the user represented by id1'),
    
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  membershipGetResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: joi.array().items(joi.string()).description('ids of all members of the group')
  }),

  membershipPutBody: joi.object({
    id: joi.string().required().description('id of the user joining the group'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (id + group + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the join was requested')
  }),

  membershipDeleteBody: joi.object({
    id: joi.string().required().description('id of the user leaving the group'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (id + group + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  groupsPostBody: joi.object({
    id1: joi.string().required().description('id of the first founder'),
    id2: joi.string().required().description('id of the second founder'),
    id3: joi.string().required().description('id of the third founder'),
    sig1: joi.string().required()
      .description('message (id1 + id2 + id3 + timestamp) signed by the user represented by id1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the group creation was requested')
  }),

  groupsPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.group
  }),

  groupsDeleteBody: joi.object({
    id: joi.string().required().description('id of the user deleting the group'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (id + group + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  fetchUserInfoPostBody: joi.object({
    id: joi.string().required().description('id of the user'),
    sig: joi.string().required()
      .description('message (id + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  fetchUserInfoPostResponse: joi.object({
    data: joi.object({
      score: schemas.score,
      eligibleGroupsUpdated: joi.boolean()
        .description('boolean indicating whether the `eligibleGroups` array returned is up-to-date. If `true`, ' +
          '`eligibleGroups` will contain all eligible groups. If `false`, `eligibleGroups` will only contain eligible groups in the founding stage.'),
      currentGroups: joi.array().items(schemas.group),
      eligibleGroups: joi.array().items(schemas.group),
      connections: joi.array().items(schemas.user),
      verifications: joi.array().items(joi.string())
    })
  }),

  usersPostBody: joi.object({
    id: joi.string().required().description("user's id"),
    signingKey: joi.string().required().description("the public key of the user that is used to sign requests")
  }),

  usersPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.user
  }),

  fetchVerificationPostBody: joi.object({
    id: joi.string().required().description('id of the user'),
    context: joi.string().required().description('the context of the id (typically an application)'),
    userid: joi.string().required().description('an id used by the app consuming the verification'),
    sig: joi.string().required().description('message (context + "," + userid + "," + timestamp) signed by the user represented by id'),
    sponsorshipSig: joi.string().description('message (context + "," + id + "," + timestamp) signed by a context that wants to sponsor this user'),
    timestamp: schemas.timestamp.required().description('milliseconds since epoch when the verification was requested')
  }),

  fetchVerificationPostResponse: joi.object({
    data: joi.object({
      publicKey: joi.string().description("the node's public key."),
      revocableIds: joi.array().items(joi.string()).description("ids formerly used by this user that can be safely revoked"),
      sig: joi.string().description('verification message ( context + "," + userid +  "," + timestamp [ + "," + revocableId ... ] ) signed by the node'),
      timestamp: schemas.timestamp.description('milliseconds since epoch when the verification was signed')
    })
  }),

  ipGetResponse: joi.object({
    data: joi.object({
      ip: joi.string().description("IPv4 address in dot-decimal notation.")
    })
  }),

  userScore: joi.object({
    data: joi.object({
      score: schemas.score
    })
  }),

  userConnections: joi.object({
    data: joi.object({
      users: joi.array().items(joi.string())
    })
  }),

  contextsGetResponse: joi.object({
    data: schemas.context
  }),

  verificationGetResponse: joi.object({
    data: joi.object({
      timestamp: schemas.timestamp.description('milliseconds since epoch since the last verification')
    })
  }),

  trustedPutBody: joi.object({
    id: joi.string().required().description('id of the user'),
    trusted: joi.array().items(joi.string())
      .required().description('list of at least 3 ids that belongs to trusted connections of the user'),
    sig: joi.string().required()
      .description('message (id + trusted + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when update is requested')
  }),

  signingKeyPutBody: joi.object({
    id: joi.string().required().description('id of the user'),
    signingKey: joi.string().required().description('new signing key for the user'),
    sigs: joi.array().items(
      joi.object({
        id: joi.string(),
        sig: joi.string()
      })
    ).description('list of signatures by two of trusted connections on message (id + signingKey + timestamp)'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when update is requested')
  }),

}, schemas);

const verify = function(message, id, sig, res, e) {
  const user = db.loadUser(id);
  if (!nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(user.signingKey))) {
    res.throw(403, e);
  }
}

const handlers = {

  connectionsPut: function connectionsPutHandler(req, res){
    const id1 = req.body.id1;
    const id2 = req.body.id2;
    const timestamp = req.body.timestamp;
    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    
    const message = id1 + id2 + timestamp;
    const e = " wasn't id1 + id2 + timestamp signed by the user represented by ";
    verify(message, id1, req.body.sig1, res, "sig1" + e + "id1");
    verify(message, id2, req.body.sig2, res, "sig2" + e + "id2");

    const operationHash = hash('Add Connection' + message);
    if (db.isOperationApplied(operationHash)) {
      res.throw(403, "operation is applied before");
    }
    db.addConnection(id1, id2, timestamp);
    db.addOperation(operationHash, 'Add Connection', timestamp, req.body);
  },

  connectionsDelete: function connectionsDeleteHandler(req, res){
    const id1 = req.body.id1;
    const id2 = req.body.id2;
    const timestamp = req.body.timestamp;
    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }

    const message = id1 + id2 + timestamp;
    const e = "sig1 wasn't id1 + id2 + timestamp signed by the user represented by id1";
    verify(message, id1, req.body.sig1, res, e);

    const operationHash = hash('Remove Connection' + message);
    if (db.isOperationApplied(operationHash)) {
      res.throw(403, "operation is applied before");
    }
    db.removeConnection(id1, id2, timestamp);
    db.addOperation(operationHash, 'Remove Connection', timestamp, req.body);
  },

  membershipGet: function membershipGetHandler(req, res){
    const members = db.groupMembers(req.param('groupId'));
    if (! (members && members.length)) {
      res.throw(404, "Group not found");
    }
    res.send({
      "data": members
    });
  },

  membershipPut: function membershipPutHandler(req, res){
    const id = req.body.id;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = id + group + timestamp;
    const e = "sig wasn't id + group + timestamp signed by the user represented by id";
    verify(message, id, req.body.sig, res, e);

    const operationHash = hash('Add Membership' + message);
    if (db.isOperationApplied(operationHash)) {
      res.throw(403, "operation is applied before");
    }
    try {
      db.addMembership(group, id, timestamp);
      db.addOperation(operationHash, 'Add Membership', timestamp, req.body);
    } catch (e) {
      res.throw(403, e);
    }
  },

  membershipDelete: function membershipDeleteHandler(req, res){
    const id = req.body.id;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = id + group + timestamp;
    const e = "sig wasn't id + group + timestamp signed by the user represented by id";
    verify(message, id, req.body.sig, res, e);

    const operationHash = hash('Delete Membership' + message);
    if (db.isOperationApplied(operationHash)) {
      res.throw(403, "operation is applied before");
    }
    try {
      db.deleteMembership(group, id, timestamp);
      db.addOperation(operationHash, 'Delete Membership', timestamp, req.body);
    } catch (e) {
      res.throw(403, e);
    }
  },

  groupsPost: function groupsPostHandler(req, res){
    const id1 = req.body.id1;
    const id2 = req.body.id2;
    const id3 = req.body.id3;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = id1 + id2 + id3 + timestamp;
    const e = "sig1 wasn't id1 + id2 + id3 + timestamp signed by the user represented by id1";
    verify(message, id1, req.body.sig1, res, e);

    const operationHash = hash('Create Group' + message);
    if (db.isOperationApplied(operationHash)) {
      res.throw(403, "operation is applied before");
    }
    try {
      const group = db.createGroup(id1, id2, id3, timestamp);
      db.addOperation(operationHash, 'Create Group', timestamp, req.body);
      const newGroup = {
        data: {
          id: group._key,
          score: 0,
          isNew: true
        }
      };
      res.send(newGroup);
    } catch (e) {
      res.throw(403, e);
    }
  },

  groupsDelete: function groupsDeleteHandler(req, res){
    const id = req.body.id;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = id + group + timestamp;
    const e = "sig wasn't id + group + timestamp signed by the user represented by id";
    verify(message, id, req.body.sig, res, e);

    const operationHash = hash('Delete Group' + message);
    if (db.isOperationApplied(operationHash)) {
      res.throw(403, "operation is applied before");
    }
    try {
      db.deleteGroup(group, id, timestamp);
      db.addOperation(operationHash, 'Delete Group', timestamp, req.body);
    } catch (e) {
      res.throw(403, e);
    }
  },

  fetchUserInfo: function usersHandler(req, res){
    const id = req.body.id;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }

    const message = id + timestamp;
    const e = "sig wasn't id + timestamp signed by the user represented by id";
    verify(message, id, req.body.sig, res, e);

    const connections = db.userConnections(id);
    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found");
    }

    const currentGroups = db.userCurrentGroups(id);

    let eligibleGroups = db.userNewGroups(id, connections);
    let eligibleGroupsUpdated = false;
    const groupCheckInterval =
      ((module.context && module.context.configuration && module.context.configuration.groupCheckInterval) || 0);

    if (! user.eligible_timestamp ||
      Date.now() > user.eligible_timestamp + groupCheckInterval) {

      eligibleGroups = eligibleGroups.concat(
        db.userEligibleGroups(id, connections, currentGroups)
      );
      db.updateEligibleTimestamp(id, Date.now());
      eligibleGroupsUpdated = true;
    }

    res.send({
      data: {
        score: user.score,
        eligibleGroupsUpdated,
        eligibleGroups,
        currentGroups: db.loadGroups(currentGroups, connections, id),
        connections: db.loadUsers(connections),
        verifications: user.verifications
      }
    });
  },

  fetchVerification: function fetchVerification(req, res){
    const { id, context, sig, userid, timestamp: userTimestamp, sponsorshipSig } = req.body;

    const serverTimestamp = Date.now();

    if (userTimestamp > serverTimestamp + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }

    let nodePublicKey, nodePrivateKey;

    if (module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey) {
      nodePublicKey = module.context.configuration.publicKey;
      nodePrivateKey = module.context.configuration.privateKey;
    } else {
      res.throw(500, 'Server node key pair not configured')
    }

    const message = context + ',' + userid + ',' + userTimestamp;
    const e = "sig wasn't context + \",\" + userid + \",\" + timestamp signed by the user represented by id";
    verify(message, id, sig, res, e);

    const {
      verification,
      collection,
      unusedSponsorships,
      signingKey: contextKey,
    } = db.getContext(context);

    const coll = arango._collection(collection);
    if (db.latestVerificationByUser(coll, id) > userTimestamp) {
      res.throw(400, "there was an existing mapped account with a more recent timestamp");
    }

    // sponsor user if it's not sponsored but is verified.

    const isVerified = db.userHasVerification(verification, id);
    
    if (! db.isSponsored(id)) {
      if (! sponsorshipSig) {
        res.throw(403, "user is not sponsored");
      }
      if (unusedSponsorships < 1) {
        res.throw(403, "context does not have unused sponsorships");
      }
      try {
        if (! nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sponsorshipSig), b64ToUint8Array(contextKey))) {
          res.throw(403, "sig wasn't context + \",\" + userid + \",\" + timestamp signed by the signingKey of the context");
        }
      } catch (e) {
        res.throw(403, e);
      }
      if (isVerified) {
        db.sponsor(id, context);  
      }
    }

    // Verification should be checked after sponsorship.
    // Otherwise apps can rely on sponsorship error,
    // as the proof that user is verified but not sponsored.

    if (! isVerified) {
      res.throw(400, "user doesn't have the verification for the context")
    }

    // update the userid and timestamp and mark it as current in the db

    db.addId(coll, userid, id, serverTimestamp);

    // find old userids for this id that aren't currently being used by someone else

    const revocableIds = db.revocableIds(coll, userid, id);

    // sign and return the verification

    const verificationMessage = context + ',' + userid + ',' + serverTimestamp + revocableIds.length ? ',' : '' + revocableIds.join(',');

    const verificationSig = nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(nodePrivateKey));

    res.send({
      data: {
        revocableIds,
        sig: verificationSig,
        timestamp: serverTimestamp,
        publicKey: nodePublicKey
      }
    });

  },

  usersPost: function usersPostHandler(req, res){
    const id = req.body.id;
    const signingKey = req.body.signingKey;
    const ret = db.createUser(id, signingKey);
    res.send({ data: ret });
  },

  ip: function ip(req, res){
    let ip = module.context && module.context.configuration && module.context.configuration.ip;
    if (ip) {
      res.send({
        "data": {
          ip,
        }
      });
    } else {
      res.throw(500, "Ip address unknown");
    }
  },

  userScore: function userScore(req, res){
    const score = db.userScore(req.param('user'));
    if (score == null) {
      res.throw(404, "User not found");
    } else {
      res.send({
        "data": {
          score,
        }
      });
    }
  },

  userConnections: function userConnections(req, res){
    const users = db.userConnections(req.param('user'));
    if (users == null) {
      res.throw(404, "User not found");
    } else {
      res.send({
        "data": {
          users,
        }
      });
    }
  },

  contexts: function contexts(req, res){
    const context = db.getContext(req.param('context'));
    if (context == null) {
      res.throw(404, 'Context not found');
    } else {
      res.send({
        "data": context,
      });
    }
  },

  trustedPut: function trustedPutHandler(req, res){
    const id = req.body.id;
    const timestamp = req.body.timestamp;
    const trusted = req.body.trusted;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }

    const user = db.loadUser(id);
    if (!user) {
      res.throw(404, "User not found");
    }
    if (user.updateTime && user.updateTime > timestamp) {
      res.throw(400, "another update with bigger timestamp submitted before")
    }

    if (user.trusted) {
      // TODO: users should be able to update their trusted connections
      // by providing sigs of 2 trusted connections approving that
      res.throw(403, "trusted connections can't be overwritten");
    }

    const message = id + trusted.join(',') + timestamp;
    const e = "sig wasn't id + trusted + timestamp signed by the user represented by id";
    verify(message, id, req.body.sig, res, e);

    db.setTrusted(trusted, id, timestamp);
  },

  signingKeyPut: function signingKeyPutHandler(req, res){
    const id = req.body.id;
    const timestamp = req.body.timestamp;
    const signingKey = req.body.signingKey;
    const sigs = req.body.sigs;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }

    const user = db.loadUser(id);
    if (!user) {
      res.throw(404, "User not found");
    }
    if (user.updateTime && user.updateTime > timestamp) {
      res.throw(400, "another update with bigger timestamp submitted before");
    }
    
    // This part is only used by new version of mobile code to initialize signingKey
    // and is not related to recovery process
    if (b64ToUrlSafeB64(signingKey) == id) {
      return db.setSigningKey(signingKey, id, timestamp);
    }

    if (!user.trusted) {
      res.throw(403, "no trusted connection is set");
    }
    if (sigs.length < 2 ||
        sigs[0].id == sigs[1].id ||
        !user.trusted.includes(sigs[0].id) ||
        !user.trusted.includes(sigs[1].id)) {
      res.throw(403, "request should be signed by 2 different trusted connections");
    }

    const message = id + signingKey + timestamp;
    const e = "sig wasn't id + signingKey + timestamp signed by trusted connection";
    let counter = 0;
    for (let sig of sigs) {
      try {
        verify(message, sig.id, sig.sig, res, e);
        counter += 1;
      } catch (e) {}
    }
    if (counter < 2) {
      res.throw(403, e);
    }
    
    db.setSigningKey(signingKey, id, timestamp);
  },

  verification: function verification(req, res){
    const context = req.param('context');
    const userid = req.param('userid');
    const timestamp = db.latestVerificationById(context, userid);
    if (timestamp > 0){
      res.send({
        "data": {
          timestamp
        }
      });
    } else {
      res.throw(404, 'Verification not found');
    }
  },
};

router.put('/connections/', handlers.connectionsPut)
  .body(schemas.connectionsPutBody.required())
  .summary('Add a connection')
  .description('Adds a connection.')
  .response(null);

router.delete('/connections/', handlers.connectionsDelete)
  .body(schemas.connectionsDeleteBody.required())
  .summary('Remove a connection')
  .description('Removes a connection.')
  .response(null);

router.get('/membership/:groupId', handlers.membershipGet)
  .pathParam('groupId', joi.string().required())
  .summary('Get group members')
  .description('Gets all members of a group.')
  .response(schemas.membershipGetResponse);

router.put('/membership/', handlers.membershipPut)
  .body(schemas.membershipPutBody.required())
  .summary('Join a group')
  .description('Joins a user to a group. A user must have a connection to more than 50% of members and must not have been previously flagged twice for removal.')
  .response(null);

router.delete('/membership/', handlers.membershipDelete)
  .body(schemas.membershipDeleteBody.required())
  .summary('Leave a group')
  .description('Allows a user to leave a group.')
  .response(null);

router.post('/groups/', handlers.groupsPost)
  .body(schemas.groupsPostBody.required())
  .summary('Create a group')
  .description('Creates a group.')
  .response(schemas.groupsPostResponse);

router.delete('/groups/', handlers.groupsDelete)
  .body(schemas.groupsDeleteBody.required())
  .summary('Remove a group')
  .description('Removes a group with three or fewer members (founders). Any of the founders can remove the group.')
  .response(null);

router.post('/fetchUserInfo/', handlers.fetchUserInfo)
  .body(schemas.fetchUserInfoPostBody.required())
  .summary('Get information about a user')
  .description("Gets a user's score, verifications, lists of current groups, eligible groups, and current connections.")
  .response(schemas.fetchUserInfoPostResponse);

router.post('/users/', handlers.usersPost)
  .body(schemas.usersPostBody.required())
  .summary("Create a user")
  .description("Create a user")
  .response(schemas.usersPostResponse);

router.post('/fetchVerification', handlers.fetchVerification)
  .body(schemas.fetchVerificationPostBody.required())
  .summary("Get a signed verification from a server node")
  .description("Gets a signed verification for a user under a given id and context.")
  .response(schemas.fetchVerificationPostResponse);

router.get('/ip/', handlers.ip)
  .summary("Get this server's IPv4 address")
  .response(schemas.ipGetResponse);

router.get('/userScore/:user', handlers.userScore)
  .pathParam('user', joi.string().required().description("id of user"))
  .summary("Get a user's score")
  .response(schemas.userScore);

router.get('/userConnections/:user', handlers.userConnections)
  .pathParam('user', joi.string().required().description("id of user"))
  .summary("Get a user's connections")
  .response(schemas.userConnections);

router.get('/contexts/:context', handlers.contexts)
  .pathParam('context', joi.string().required().description("Unique name of the context"))
  .summary("Get information about a context")
  .response(schemas.contextsGetResponse);

router.get('/verification/:context/:userid', handlers.verification)
  .pathParam('context', joi.string().required().description('the context of the id (typically an application)'))
  .pathParam('userid', joi.string().required().description('an id used by the app represented by the context'))
  .summary('Check whether an id is verified under a context')
  .description('Returns the timestamp when the id was last verified.')
  .response(schemas.verificationGetResponse);

router.put('/trusted', handlers.trustedPut)
  .body(schemas.trustedPutBody.required())
  .summary("Set trusted connections for user")
  .description('Set trusted connections who can help users to update their signing keys when their keys are stolen/lost')
  .response(null);

router.put('/signingKey', handlers.signingKeyPut)
  .body(schemas.signingKeyPutBody.required())
  .summary("Update signing key of user")
  .description('Updates signing key of a stolen/lost brightid by help of its trusted connections')
  .response(null);

module.exports = {
  schemas,
  handlers
};
