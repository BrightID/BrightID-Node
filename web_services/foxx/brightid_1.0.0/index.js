'use strict';
const createRouter = require('@arangodb/foxx/router');
const db = require('./db.js');
const router = createRouter();
const Joi = require('joi');
const nacl = require('tweetnacl');
const enc = require('./encoding.js');

module.context.use(router);

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

// low-level schemas
var schemas = {
  timestamp: Joi.number().integer().required(),
  group: Joi.object({
    id: Joi.string().required().description('unique identifier (base64) of the group'),
    score: Joi.number().min(0).max(100).default(0),
    isNew: Joi.boolean().default(true)
  })
};

// extend low-level schemas with high-level schemas
schemas = Object.assign({
  connectionsPutBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required(),
    // publicKey2: Joi.string().base64().required(),
    publicKey1: Joi.string().required().description('public key of the first user (base64)'),
    publicKey2: Joi.string().required().description('public key of the second user (base64)'),
    sig1: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey1'),
    sig2: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey2'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the connection occurred')
  }),
  connectionsDeleteBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required(),
    // publicKey2: Joi.string().base64().required(),
    publicKey1: Joi.string().required().description('public key of the user removing the connection (base64)'),
    publicKey2: Joi.string().required().description('public key of the second user (base64)'),
    sig1: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),
  membershipPutBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required(),
    publicKey: Joi.string().required().description('public key of the user joining the group (base64)'),
    group: Joi.string().required().description('group id'),
    sig: Joi.string().required()
      .description('message (publicKey + group + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the join was requested')
  }),
  membershipDeleteBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required(),
    publicKey: Joi.string().required().description('public key of the user leaving the group (base64)'),
    group: Joi.string().required().description('group id'),
    sig: Joi.string().required()
      .description('message (publicKey + group + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),
  groupsPostBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required(),
    // publicKey2: Joi.string().base64().required(),
    // publicKey3: Joi.string().base64().required(),
    publicKey1: Joi.string().required().description('public key of the first founder (base64)'),
    publicKey2: Joi.string().required().description('public key of the second founder (base64)'),
    publicKey3: Joi.string().required().description('public key of the third founder (base64)'),
    sig1: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + publicKey3 + timestamp) signed by the user represented by publicKey1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the group creation was requested')
  }),
  groupsPostResponse: Joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.group
  }),
  groupsDeleteBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey: Joi.string().base64().required(),
    publicKey: Joi.string().required().description('public key of the user deleting the group (base64)'),
    group: Joi.string().required().description('group id'),
    sig: Joi.string().required()
      .description('message (publicKey + group + timestamp) signed by the user represented by publicKey'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),
  userInfoResponse: Joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: Joi.object({
      currentGroups: Joi.array().items(schemas.group),
      eligibleGroups: Joi.array().items(schemas.group)
    })
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
    const message = enc.strToUint8Array(publicKey1 + publicKey2 + timestamp);

    //Verify signatures
    try {
      if (! nacl.sign.detached.verify(message, enc.b64ToUint8Array(req.body.sig1), enc.b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + timestamp signed by publicKey1");
      }
      if (! nacl.sign.detached.verify(message, enc.b64ToUint8Array(req.body.sig2), enc.b64ToUint8Array(publicKey2))){
        res.throw(403, "sig2 wasn't publicKey1 + publicKey2 + timestamp signed by publicKey2");
      }
    } catch (e) {
      res.throw(403, e);
    }
    db.addConnection(publicKey1, publicKey2, timestamp);
  },
  connectionsDelete: function connectionsDeleteHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const timestamp = req.body.timestamp;
    if (timestamp > Date.now() + TIME_FUDGE){
      res.throw(400, "timestamp can't be in the future");
    }
    const message = enc.strToUint8Array(publicKey1 + publicKey2 + req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, enc.b64ToUint8Array(req.body.sig1), enc.b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey1 + publicKey2 + timestamp signed by publicKey1");
      }
    } catch (e) {
      res.throw(403, e);
    }
    db.removeConnection(publicKey1, publicKey2, timestamp);
  },
  membershipPut: function membershipPutHandler(req, res){},
  membershipDelete: function membershipDeleteHandler(req, res){},
  groupsPost: function groupsPostHandler(req, res){
    const newGroup = {
      id: "foo"
    };
    res.send(newGroup);
  },
  groupsDelete: function groupsDeleteHandler(req, res){},
  userInfo: function userInfoHandler(req, res){}
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

router.get('/user-info/:publicKey', handlers.userInfo)
// Consider using this if they ever update Joi
// .pathParam('publicKey', Joi.string().base64().required)
  .pathParam('publicKey', Joi.string().required, "User's public key in URL-safe Base64 ('_' instead of '/' ,  '-' instead of '+', omit '=').")
  .summary('Get information about a user')
  .description('Gets lists of current groups, eligible groups, and current connections for the given user.')
  .response(schemas.userInfoResponse);

module.exports = {
  schemas: schemas,
  handlers: handlers
};