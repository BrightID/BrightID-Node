'use strict';
const secp256k1 = require('secp256k1');
const createKeccakHash = require('keccak');

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
  hash,
  pad32
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

  userGet: function userGetHandler(req, res){
    const id = req.param('id');

    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found");
    }

    const connections = db.userConnections(id);
    const groups = db.userGroups(id);
    const invites = db.userInvitedGroups(id);
    db.updateEligibleGroups(id, connections, groups);

    res.send({
      data: {
        score: user.score,
        createdAt: user.createdAt,
        invites,
        groups,
        connections: db.loadUsers(connections),
        verifications: user.verifications,
        isSponsored: db.isSponsored(id)
      }
    });
  },

  contextVerificationGet: function(req, res){
    const contextName = req.param('context');

    const context = db.getContext(contextName);
    if (! context) {
      res.throw(404, 'context not found');
    }

    const coll = arango._collection(context.collection);
    const contextIds = db.getLastContextIds(coll, context.verification);

    res.send({
      data: {
        contextIds: contextIds
      }
    });
  },

  verificationGet: function(req, res){
    try {
      const contextId = req.param('contextId');
      let contextName = req.param('context');
      const signed = req.param('signed');
      const context = db.getContext(contextName);
      if (! context) {
        throw 'context not found';
      }

      const coll = arango._collection(context.collection);
      const user = db.getUserByContextId(coll, contextId);
      if (! user) {
        throw 'contextId not found';
      }

      if (! db.isSponsored(user)) {
        throw 'user is not sponsored';
      }

      if (! db.userHasVerification(context.verification, user)) {
        throw 'user can not be verified for this context';
      }

      let contextIds = db.getContextIdsByUser(coll, user);
      if (contextId != contextIds[0]) {
        throw 'user is not using this account anymore';
      }

      // sign and return the verification
      let sig, publicKey;
      if (signed == 'nacl') {
        if (! (module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey)){
          throw 'Server node key pair not configured';
        }

        const message = contextName + ',' + contextIds.join(',');
        const privateKey = module.context.configuration.privateKey;
        publicKey = module.context.configuration.publicKey;
        sig = uInt8ArrayToB64(
          Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(privateKey)))
        );
      } else if (signed == 'eth') {
        if (! (module.context && module.context.configuration && module.context.configuration.ethPrivateKey)){
          throw 'Server node ethereum privateKey not configured';
        }

        const message = pad32(contextName) + contextIds.map(pad32).join('');
        let ethPrivateKey = module.context.configuration.ethPrivateKey;
        ethPrivateKey = new Uint8Array(Buffer.from(ethPrivateKey, 'hex'));
        const h = new Uint8Array(createKeccakHash('keccak256').update(message).digest());
        publicKey = Buffer.from(Object.values(secp256k1.publicKeyCreate(ethPrivateKey))).toString('hex');
        const _sig = secp256k1.ecdsaSign(h, ethPrivateKey);
        sig = {
          r: Buffer.from(Object.values(_sig.signature.slice(0, 32))).toString('hex'),
          s: Buffer.from(Object.values(_sig.signature.slice(32, 64))).toString('hex'),
          v: _sig.recid + 27,
        }
      }
      res.send({
        data: {
          unique: true,
          context: contextName,
          contextIds: contextIds,
          sig,
          publicKey
        }
      });
    } catch (e) {
      res.send({
        data: {
          unique: false,
          context: req.param('context'),
          contextIds: [],
          erroeMessage: e
        }
      });
    }
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
    const contextName = req.param('context');
    let context = db.getContext(contextName);
    if (context == null) {
      res.throw(404, 'Context not found');
    } else {
      res.send({
        "data": {
          verification: context.verification,
          verificationUrl: context.verificationUrl,
          isApp: context.isApp,
          appLogo: context.appLogo,
          appUrl: context.appUrl,
          hasSponsorships: db.unusedSponsorship(contextName) > 0
        }
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
  .queryParam('signed', joi.string().description('the value will be eth or nacl to indicate the type of signature returned'))
  .summary('Gets a signed verification')
  .description("Gets a signed verification for the user that is signed by the node")
  .response(schemas.verificationGetResponse);

router.get('/verifications/:context', handlers.contextVerificationGet)
  .pathParam('context', joi.string().required().description('the context in which the user is verified'))
  .summary('Gets list of all of contextIds')
  .description("Gets list of all of contextIds in the context that are currently linked to unique humans")
  .response(schemas.contextVerificationGetResponse);

router.get('/ip', handlers.ip)
  .summary("Get this server's IPv4 address")
  .response(schemas.ipGetResponse);

router.get('/contexts/:context', handlers.contexts)
  .pathParam('context', joi.string().required().description("Unique name of the context"))
  .summary("Get information about a context")
  .response(schemas.contextsGetResponse);

module.exports = {
  handlers
};
