'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const nacl = require('tweetnacl');

const db = require('./db');
const enc = require('./encoding');

const strToUint8Array = enc.strToUint8Array;
const b64ToUint8Array = enc.b64ToUint8Array;

// all keys in the DB are in the url/directory/db safe b64 format
const safe = enc.b64ToUrlSafeB64;

const router = createRouter();
module.context.use(router);

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

// low-level schemas
var schemas = {
  timestamp: joi.number().integer().required(),
  group: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    score: joi.number().min(0).max(100).default(0),
    isNew: joi.boolean().default(true),
    knownMembers: joi.array().items(joi.string()).description('url-safe public keys of two or three current' +
      ' members connected to the reference user, or if the group is being founded, the co-founders that have joined'),
    founders: joi.array().items(joi.string()).description('url-safe public keys of the three founders of the group')
  }),
  user: joi.object({
    key: joi.string().required().description('url-safe public key of the user'),
    score: joi.number().min(0).max(100).default(0)
  })
};

// Consider using this in the schemas below if they ever update joi
// publicKey1: joi.string().base64().required(),

// extend low-level schemas with high-level schemas
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

  usersResponse: joi.object({
    data: joi.object({
      score: joi.number().min(0).max(100).default(0),
      eligibleGroupsUpdated: joi.boolean().description('boolean indicating whether the `eligibleGroups` array returned is up-to-date. If `true`, `eligibleGroups` will contain all eligible groups. If `false`, `eligibleGroups` will only contain eligible groups in the founding stage.'),
      currentGroups: joi.array().items(schemas.group),
      eligibleGroups: joi.array().items(schemas.group)
    })
  }),

  usersPostBody: joi.object({
    publicKey: joi.string().required().description('public key of the first founder (base64)')
  }),

  usersPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.user
  }),

  fetchUserInfoPostBody: joi.object({
    publicKey: joi.string().required().description('public key of the user deleting the group (base64)'),
    sig: joi.string().required()
      .description('message (publicKey + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  })

}, schemas);

const handlers = {

  connectionsPut: function connectionsPutHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const timestamp =  req.body.timestamp;
    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey1 + publicKey2 + timestamp);

    //Verify signatures
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig1), b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + timestamp signed by publicKey1");
      }
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig2), b64ToUint8Array(publicKey2))){
        res.throw(403, "sig2 wasn't publicKey1 + publicKey2 + timestamp signed by publicKey2");
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
    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey1 + publicKey2 + req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig1), b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + timestamp signed by publicKey1");
      }
    } catch (e) {
      res.throw(403, e);
    }
    db.removeConnection(safe(publicKey1), safe(publicKey2), timestamp);
  },

  membershipGet: function membershipGetHandler(req, res){
    const members = db.groupMembers(req.param('groupId'));
    if(!(members && members.length)){
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

    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey + group + timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig), b64ToUint8Array(publicKey))){
        res.throw(403, "sig wasn't publicKey + group + timestamp signed by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try{
      db.addMembership(group, safe(publicKey), timestamp);
    }catch(e){
      res.throw(403, e);
    }
  },

  membershipDelete: function membershipDeleteHandler(req, res){
    const publicKey = req.body.publicKey;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey + group + timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig), b64ToUint8Array(publicKey))){
        res.throw(403, "sig wasn't publicKey + group + timestamp signed by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try{
      db.deleteMembership(group, safe(publicKey), timestamp);
    }catch(e){
      res.throw(403, e);
    }
  },
  
  groupsPost: function groupsPostHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const publicKey3 = req.body.publicKey3;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey1 + publicKey2 + publicKey3 + 
        req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig1), b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + publicKey3 + timestamp signed by publicKey1");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try{
      const group = db.createGroup(safe(publicKey1), safe(publicKey2), safe(publicKey3), timestamp);

      const newGroup = {
        data : {
          id: group._key,
          score: 0,
          isNew: true
        }
      };
      res.send(newGroup);
    }catch(e){
      res.throw(403, e);
    }
  },

  groupsDelete: function groupsDeleteHandler(req, res){
    const publicKey = req.body.publicKey;
    const group = req.body.group;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(publicKey + group +
        req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(req.body.sig), b64ToUint8Array(publicKey))){
        res.throw(403, "sig wasn't publicKey + group + timestamp signed by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    try{
      db.deleteGroup(group, safe(publicKey), timestamp);
    }catch(e){
      res.throw(403, e);
    }
  },
  
  fetchUserInfo: function usersHandler(req, res){
    const key = req.body.publicKey;
    const timestamp = req.body.timestamp;
    const sig = req.body.sig;

    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = strToUint8Array(key + timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, b64ToUint8Array(sig), b64ToUint8Array(key))){
        res.throw(403, "sig wasn't publicKey + timestamp signed by publicKey");
      }
    } catch (e) {
      res.throw(403, e);
    }

    const safeKey = safe(key);

    const user = db.loadUser(safeKey);
    if(!user){
      res.throw(404, "User not found");
    }

    let eligibleGroups = db.userNewGroups(safeKey);
    let eligibleGroupsUpdated = false;
    const groupCheckInterval =
      ((module.context && module.context.configuration && module.context.configuration.groupCheckInterval) || 0);

    if(!user.eligible_timestamp || 
      Date.now() > user.eligible_timestamp + groupCheckInterval){
      
      eligibleGroups = eligibleGroups.concat(
        db.userEligibleGroups(safeKey)
      );
      db.updateEligibleTimestamp(safeKey, Date.now());
      eligibleGroupsUpdated = true;
    }

    res.send({
      data:{
        score: user.score,
        eligibleGroupsUpdated: eligibleGroupsUpdated,
        eligibleGroups: eligibleGroups,
        currentGroups: db.userCurrentGroups(safeKey)
      }
    });
  },

  usersPost: function usersPostHandler(req, res){
    const key = req.body.publicKey;
    const ret = db.createUser(safe(key));
    res.send({data: ret});
  },

  ip: function ip(req, res){
    let ip = module.context && module.context.configuration && module.context.configuration.ip;
    if (ip){
      res.send({
        data: {
          ip: ip
        }
      });
    } else {
      res.throw(500, "Ip address unknown");
    }
  }

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
  .summary('Remove a group.')
  .description('Removes a group with three or fewer members (founders). Any of the founders can remove the group.')
  .response(null);

router.post('/fetchUserInfo/', handlers.fetchUserInfo)
  .body(schemas.fetchUserInfoPostBody)
  .summary('Get information about a user')
  .description("Gets a user's score, lists of current groups, eligible groups, and current connections for the given user.")
  .response(schemas.usersResponse);

router.post('/users/', handlers.usersPost)
  .body(schemas.usersPostBody.required())
  .summary("Create a user")
  .description("Create a user")
  .response(schemas.usersPostResponse);

router.get('/ip/', handlers.ip)
  .summary("Get this server's IPv4 address")
  .response(joi.string().description("IPv4 address in dot-decimal notation."));

module.exports = {
  schemas: schemas,
  handlers: handlers
};
