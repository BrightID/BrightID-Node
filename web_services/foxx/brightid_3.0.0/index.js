'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const arango = require('@arangodb').db;
const nacl = require('tweetnacl');
const db = require('./db');
const schemas = require('./schemas').schemas;
const operations = require('./operations');
const {
  strToUint8Array,
  b64ToUint8Array,
  uInt8ArrayToB64,
  hash
} = require('./encoding');

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

const handlers = {
  operationsPut: function(req, res){
    const op = req.body;
    const hash = req.param('hash');
    op._key = hash;
    if (operationsHashesColl.exists(op._key)) {
      res.throw(400, 'operation is applied before');
    }
    try {
      operations.verify(op);
    } catch (e) {
      res.throw(400, e);
    }
    if (op.name == 'Link ContextId') {
      operations.encrypt(op);
    }
    op.state = 'init'
    db.upsertOperation(op);
  },

  operationGet: function operationGetHandler(req, res){
    const hash = req.param('hash');
    const op = db.loadOperation(hash);
    if (op) {
      res.send({
        "data": {
          "state": op.state,
          "result": op.result
        }
      });
    } else {
      res.throw(404, "Operation not found");
    }
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

  userGet: function userGetHandler(req, res){
    const id = req.param('id');

    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found");
    }
    const connections = db.userConnections(id);
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
        createdAt: user.createdAt,
        eligibleGroupsUpdated,
        eligibleGroups,
        currentGroups: db.loadGroups(currentGroups, connections, id),
        connections: db.loadUsers(connections),
        verifications: user.verifications
      }
    });
  },

  verificationGet: function(req, res){
    const contextId = req.param('contextId');
    const context = req.param('context');

    const { verification, collection, secretKey } = db.getContext(context);
    const coll = arango._collection(collection);
    const user = db.getUserByContextId(coll, contextId);
    if (!user) {
      res.throw(404, 'contextId not found');
    }

    if (!db.isSponsored(user)) {
      res.throw(403, 'user is not sponsored');
    }

    if (!db.userHasVerification(verification, user)) {
      res.throw(403, 'user can not be verified for this context');
    }

    const contextIds = db.getContextIdsByUser(coll, user);
    if (contextId != contextIds.pop()) {
      res.throw(403, 'user is not using this account anymore');
    }

    const timestamp = Date.now();
    // sign and return the verification
    const message = context + ',' + contextId + ',' + timestamp + (contextIds.length ?  ',' + contextIds.join(',') : '');

    if (!(module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey)){
      res.throw(500, 'Server node key pair not configured')
    }

    const publicKey = module.context.configuration.publicKey;
    const privateKey = module.context.configuration.privateKey;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(privateKey)))
    );

    res.send({
      data: {
        revocableContextIds: contextIds,
        timestamp: timestamp,
        sig: sig,
        publicKey: publicKey
      }
    });
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

  contexts: function contexts(req, res){
    const context = db.getContext(req.param('context'));
    if (context == null) {
      res.throw(404, 'Context not found');
    } else {
      res.send({
        "data": context,
      });
    }
  }
};

router.put('/operations/:hash', handlers.operationsPut)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .body(schemas.operation)
  .summary('Add an operation to be applied after consensus')
  .description('Add an operation be applied after consensus.')
  .response(null);

router.get('/users/:id', handlers.userGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .summary('Get information about a user')
  .description("Gets a user's score, verifications, joining date, lists of , current groups, eligible groups, and current connections.")
  .response(schemas.userGetResponse);

router.get('/operations/:hash', handlers.operationGet)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .summary('Get state and result of an operation')
  .response(schemas.operationGetResponse);

router.get('/verifications/:context/:contextId', handlers.verificationGet)
  .pathParam('context', joi.string().required().description('the context in which the user is verified'))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .summary('Get a signed verification')
  .description("Gets a signed verification for the user that is signed by the node")
  .response(schemas.verificationGetResponse);

router.get('/memberships/:groupId', handlers.membershipGet)
  .pathParam('groupId', joi.string().required())
  .summary('Get group members')
  .description('Gets all members of a group.')
  .response(schemas.membershipGetResponse);

router.get('/ip/', handlers.ip)
  .summary("Get this server's IPv4 address")
  .response(schemas.ipGetResponse);

router.get('/contexts/:context', handlers.contexts)
  .pathParam('context', joi.string().required().description("Unique name of the context"))
  .summary("Get information about a context")
  .response(schemas.contextsGetResponse);

module.exports = {
  handlers
};
