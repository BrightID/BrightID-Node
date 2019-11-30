'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const nacl = require('tweetnacl');

const db = require('./db');
const arango = require('@arangodb').db;
const {
  strToUint8Array,
  b64ToUint8Array,
  uInt8ArrayToB64,
  b64ToUrlSafeB64: safe 
} = require('./encoding');

const router = createRouter();
module.context.use(router);

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

// Consider using this in the schemas below if they ever update joi
// publicKey1: joi.string().base64().required(),

// lowest-level schemas
var schemas = {
  score: joi.number().min(0).max(100).default(0),
  timestamp: joi.number().integer().required()
};

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  user: joi.object({
    key: joi.string().required().description('url-safe public key of the user'),
    score: schemas.score,
    verifications: joi.array().items(joi.string())
  }),
  group: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    score: schemas.score,
    verifications: joi.array().items(joi.string()),
    isNew: joi.boolean().default(true),
    knownMembers: joi.array().items(joi.string()).description('url-safe public keys of two or three current' +
      ' members connected to the reference user, or if the group is being founded, the co-founders that have joined'),
    founders: joi.array().items(joi.string()).description('url-safe public keys of the three founders of the group')
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
    publicKey1: joi.string().required().description('public key of the first user (base64)'),
    publicKey2: joi.string().required().description('public key of the second user (base64)'),
    sig1: joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey1'),
    sig2: joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey2'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the connection occurred')
  }),

  connectionsDeleteBody: joi.object({
    publicKey1: joi.string().required().description('public key of the user removing the connection (base64)'),
    publicKey2: joi.string().required().description('public key of the second user (base64)'),
    sig1: joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  membershipGetResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: joi.array().items(joi.string()).description('url-safe public keys of all members of the group')
  }),

  membershipPutBody: joi.object({
    publicKey: joi.string().required().description('public key of the user joining the group (base64)'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (publicKey + group + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the join was requested')
  }),

  membershipDeleteBody: joi.object({
    publicKey: joi.string().required().description('public key of the user leaving the group (base64)'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (publicKey + group + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  groupsPostBody: joi.object({
    publicKey1: joi.string().required().description('public key of the first founder (base64)'),
    publicKey2: joi.string().required().description('public key of the second founder (base64)'),
    publicKey3: joi.string().required().description('public key of the third founder (base64)'),
    sig1: joi.string().required()
      .description('message (publicKey1 + publicKey2 + publicKey3 + timestamp) signed by the user represented by publicKey1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the group creation was requested')
  }),

  groupsPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.group
  }),

  groupsDeleteBody: joi.object({
    publicKey: joi.string().required().description('public key of the user deleting the group (base64)'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (publicKey + group + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  fetchUserInfoPostBody: joi.object({
    publicKey: joi.string().required().description('public key of the user (base64)'),
    sig: joi.string().required()
      .description('message (publicKey + timestamp) signed by the user represented by publicKey'),
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
    publicKey: joi.string().required().description("user's public key")
  }),

  usersPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.user
  }),

  fetchVerificationPostBody: joi.object({
    publicKey: joi.string().required().description('public key of the user (base64)'),
    context: joi.string().required().description('the context of the id (typically an application)'),
    id: joi.string().required().description('an id used by the app consuming the verification'),
    sig: joi.string().required().description('message (context + "," + id + "," + timestamp) signed by the user represented by publicKey'),
    sponsorshipSig: joi.string().description('message (context + "," + id + "," + timestamp) signed by a context that wants to sponsor this user'),
    timestamp: schemas.timestamp.required().description('milliseconds since epoch when the verification was requested')
  }),

  fetchVerificationPostResponse: joi.object({
    data: joi.object({
      publicKey: joi.string().description("the node's public key."),
      revocableIds: joi.array().items(joi.string()).description("ids formerly used by this user that can be safely revoked"),
      sig: joi.string().description('verification message ( context + "," + id +  "," + timestamp [ + "," + revocableId ... ] ) signed by the node'),
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

}, schemas);

const handlers = {

  connectionsPut: function connectionsPutHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const timestamp = req.body.timestamp;
    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey1 + publicKey2 + timestamp);

    //Verify signatures
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig1), b64ToUint8Array(publicKey1))) {
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + timestamp signed by the user represented by publicKey1");
      }
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig2), b64ToUint8Array(publicKey2))) {
        res.throw(403, "sig2 wasn't publicKey1 + publicKey2 + timestamp signed by the user represented by publicKey2");
      }
    } catch (e) {
      res.throw(403, e);
    }

    db.addConnection(safe(publicKey1), safe(publicKey2), timestamp);
  },

  connectionsDelete: function connectionsDeleteHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const timestamp = req.body.timestamp;
    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey1 + publicKey2 + req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig1), b64ToUint8Array(publicKey1))) {
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + timestamp signed by the user represented by publicKey1");
      }
    } catch (e) {
      res.throw(403, e);
    }
    db.removeConnection(safe(publicKey1), safe(publicKey2), timestamp);
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
    const publicKey = req.body.publicKey;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey + group + timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig), b64ToUint8Array(publicKey))) {
        res.throw(403, "sig wasn't publicKey + group + timestamp signed by the user represented by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try {
      db.addMembership(group, safe(publicKey), timestamp);
    } catch (e) {
      res.throw(403, e);
    }
  },

  membershipDelete: function membershipDeleteHandler(req, res){
    const publicKey = req.body.publicKey;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey + group + timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig), b64ToUint8Array(publicKey))) {
        res.throw(403, "sig wasn't publicKey + group + timestamp signed by the user represented by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try {
      db.deleteMembership(group, safe(publicKey), timestamp);
    } catch (e) {
      res.throw(403, e);
    }
  },

  groupsPost: function groupsPostHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const publicKey3 = req.body.publicKey3;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey1 + publicKey2 + publicKey3 +
      req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig1), b64ToUint8Array(publicKey1))) {
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + publicKey3 + timestamp signed by the user represented by publicKey1");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try {
      const group = db.createGroup(safe(publicKey1), safe(publicKey2), safe(publicKey3), timestamp);

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
    const publicKey = req.body.publicKey;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey + group +
      req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig), b64ToUint8Array(publicKey))) {
        res.throw(403, "sig wasn't publicKey + group + timestamp signed by the user represented by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try {
      db.deleteGroup(group, safe(publicKey), timestamp);
    } catch (e) {
      res.throw(403, e);
    }
  },

  fetchUserInfo: function usersHandler(req, res){
    const key = req.body.publicKey;
    const timestamp = req.body.timestamp;
    const sig = req.body.sig;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(key + timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(sig), b64ToUint8Array(key))) {
        res.throw(403, "sig wasn't publicKey + timestamp signed by the user represented by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    const safeKey = safe(key);
    const connections = db.userConnectionsRaw(safeKey);

    const user = db.loadUser(safeKey);
    if (! user) {
      res.throw(404, "User not found");
    }

    const currentGroups = db.userCurrentGroups(safeKey);

    let eligibleGroups = db.userNewGroups(safeKey, connections);
    let eligibleGroupsUpdated = false;
    const groupCheckInterval =
      ((module.context && module.context.configuration && module.context.configuration.groupCheckInterval) || 0);

    if (! user.eligible_timestamp ||
      Date.now() > user.eligible_timestamp + groupCheckInterval) {

      eligibleGroups = eligibleGroups.concat(
        db.userEligibleGroups(safeKey, connections, currentGroups)
      );
      db.updateEligibleTimestamp(safeKey, Date.now());
      eligibleGroupsUpdated = true;
    }

    res.send({
      data: {
        score: user.score,
        eligibleGroupsUpdated,
        eligibleGroups,
        currentGroups: db.loadGroups(currentGroups, connections, safeKey),
        connections: db.loadUsers(connections),
        verifications: user.verifications,
      }
    });
  },

  fetchVerification: function fetchVerification(req, res){
    const { publicKey: key, context, sig, id, timestamp: userTimestamp, sponsorshipSig } = req.body;

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

    const message = strToUint8Array(context + ',' + id + ',' + userTimestamp);
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(sig), b64ToUint8Array(key))) {
        res.throw(403, "sig wasn't context + \",\" + id + \",\" + timestamp signed by the user represented by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }
    const {
      verification,
      collection,
      unusedSponsorships,
      signingKey: contextKey,
    } = db.getContext(context);

    const coll = arango._collection(collection);
    if (db.latestVerificationByUser(coll, key) > userTimestamp) {
      res.throw(400, "there was an existing mapped account with a more recent timestamp");
    }

    const safeKey = safe(key);

    // sponsor user if it's not sponsored but is verified.

    const isVerified = db.userHasVerification(verification, safeKey);
    
    if (! db.isSponsored(safeKey)) {
      if (! sponsorshipSig) {
        res.throw(403, "user is not sponsored");
      }
      if (unusedSponsorships < 1) {
        res.throw(403, "context does not have unused sponsorships");
      }
      try {
        if (! nacl.sign.detached.verify(message, b64ToUint8Array(sponsorshipSig), b64ToUint8Array(contextKey))) {
          res.throw(403, "sig wasn't context + \",\" + id + \",\" + timestamp signed by the signingKey of the context");
        }
      } catch (e) {
        res.throw(403, e);
      }
      if (isVerified) {
        db.sponsor(safeKey, context);  
      }
    }

    // Verification should be checked after sponsorship.
    // Otherwise apps can rely on sponsorship error,
    // as the proof that user is verified but not sponsored.

    if (! isVerified) {
      res.throw(400, "user doesn't have the verification for the context")
    }

    // update the id and timestamp and mark it as current in the db

    db.addId(coll, id, safeKey, serverTimestamp);

    // find old ids for this public key that aren't currently being used by someone else

    const revocableIds = db.revocableIds(coll, id, safeKey);

    // sign and return the verification

    const verificationMessage = context + ',' + id + ',' + serverTimestamp + revocableIds.length ? ',' : '' + revocableIds.join(',');

    const verificationSig = nacl.sign.detached(message, b64ToUint8Array(nodePrivateKey));

    res.send({
      data: {
        revocableIds,
        sig: verificationSig,
        timestamp: serverTimestamp,
        publicKey: uInt8ArrayToB64(nodePublicKey)
      }
    });

  },

  usersPost: function usersPostHandler(req, res){
    const key = req.body.publicKey;
    const ret = db.createUser(safe(key));
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

  verification: function verification(req, res){
    const context = req.param('context');
    const id = req.param('id');
    const timestamp = db.latestVerificationById(context, id);
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
  .pathParam('user', joi.string().required().description("Public key of user (url-safe base 64)"))
  .summary("Get a user's score")
  .response(schemas.userScore);

router.get('/userConnections/:user', handlers.userConnections)
  .pathParam('user', joi.string().required().description("Public key of user (url-safe base 64)"))
  .summary("Get a user's connections")
  .response(schemas.userConnections);

router.get('/contexts/:context', handlers.contexts)
  .pathParam('context', joi.string().required().description("Unique name of the context"))
  .summary("Get information about a context")
  .response(schemas.contextsGetResponse);

router.get('/verification/:context/:id', handlers.verification)
  .pathParam('context', joi.string().required().description('the context of the id (typically an application)'))
  .pathParam('id', joi.string().required().description('an id used by the app represented by the context'))
  .summary('Check whether an id is verified under a context')
  .description('Returns the timestamp when the id was last verified.')
  .response(schemas.verificationGetResponse);

module.exports = {
  schemas,
  handlers
};
