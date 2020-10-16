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
  pad32,
  addressToBytes32
} = require('./encoding');

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');
const variablesColl = arango._collection('variables');

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences
// error numbers
const CONTEXT_NOT_FOUND = 1;
const CONTEXTID_NOT_FOUND = 2;
const CAN_NOT_BE_VERIFIED = 3;
const NOT_SPONSORED = 4;
const OLD_ACCOUNT = 5;
const KEYPAIR_NOT_SET = 6;
const ETHPRIVATEKEY_NOT_SET = 7;
const ETHNAME_NOT_SET = 8;
const OPERATION_NOT_FOUND = 9;
const USER_NOT_FOUND = 10;
const IP_NOT_SET = 11;

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
      // allow 60 operations in 15 minutes window by default
      const timeWindow = (module.context.configuration.operationsTimeWindow || 15 * 60) * 1000;
      const limit = module.context.configuration.operationsLimit || 60;
      operations.checkLimits(op, timeWindow, limit);
      if (op.name == 'Link ContextId') {
        operations.encrypt(op);
      }
      else if (op.name == 'Sponsor') {
        operations.updateSponsorOp(op);
      }
      op.state = 'init';
      if (JSON.stringify(op).length > 2000) {
          res.throw(400, 'Operation is too big');
      }
      db.upsertOperation(op);
    } catch (e) {
      const code = (e == 'Too Many Requests') ? 429 : 400;
      res.throw(code, e);
    }
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
      res.throw(404, "Operation not found", {errorNum: OPERATION_NOT_FOUND});
    }
  },

  userGet: function userGetHandler(req, res){
    const id = req.param('id');
    const verifications = db.userVerifications(id);

    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found", {errorNum: USER_NOT_FOUND});
    }

    const connections = db.userConnections(id);
    const groups = db.userGroups(id);
    const invites = db.userInvitedGroups(id);
    db.updateEligibleGroups(id, connections, groups);

    res.send({
      data: {
        score: user.score,
        createdAt: user.createdAt,
        flaggers: user.flaggers,
        invites,
        groups,
        connections: db.loadUsers(connections),
        verifications,
        isSponsored: db.isSponsored(id)
      }
    });
  },

  contextVerificationGet: function(req, res){
    const contextName = req.param('context');

    const context = db.getContext(contextName);
    if (! context) {
      res.throw(404, 'context not found', {errorNum: CONTEXT_NOT_FOUND});
    }

    const coll = arango._collection(context.collection);
    let contextIds = db.getLastContextIds(coll, context.verification);

    // We can remove this filter when we upgrade to arango 3.6
    if (contextIds.length == 1 && contextIds[0] === null) {
      contextIds = []
    }

    res.send({
      data: {
        contextIds: contextIds
      }
    });
  },

  verificationGet: function(req, res){
    let unique = true;
    let contextId = req.param('contextId');
    let contextName = req.param('context');
    const signed = req.param('signed');
    const context = db.getContext(contextName);
    if (! context) {
      res.throw(404, 'context not found', {errorNum: CONTEXT_NOT_FOUND});
    }

    if (context.idsAsHex) {
      contextId = contextId.toLowerCase();
    }

    const coll = arango._collection(context.collection);
    const user = db.getUserByContextId(coll, contextId);
    if (! user) {
      res.throw(404, 'contextId not found', {errorNum: CONTEXTID_NOT_FOUND});
    }

    if (! db.isSponsored(user)) {
      res.throw(403, 'user is not sponsored', {errorNum: NOT_SPONSORED});
    }

    if (! db.userVerifications(user).includes(context.verification)) {
      res.throw(404, 'user can not be verified for this context', {errorNum: CAN_NOT_BE_VERIFIED});
    }

    let contextIds = db.getContextIdsByUser(coll, user);
    if (contextId != contextIds[0]) {
      unique = false;
    }

    // sign and return the verification
    let sig, publicKey;
    if (signed == 'nacl') {
      if (! (module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey)){
        res.throw(500, 'Server setting key pair not set', {errorNum: KEYPAIR_NOT_SET});
      }

      const message = contextName + ',' + contextIds.join(',');
      const privateKey = module.context.configuration.privateKey;
      publicKey = module.context.configuration.publicKey;
      sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(privateKey)))
      );
    } else if (signed == 'eth') {
      if (! (module.context && module.context.configuration && module.context.configuration.ethPrivateKey)){
        res.throw(500, 'Server setting "ethPrivateKey" not set', {errorNum: ETHPRIVATEKEY_NOT_SET});
      }

      if (!context.ethName) {
        res.throw(500, `"ethName" not set for context "${contextName}"`, {errorNum: ETHNAME_NOT_SET});
      }

      contextName = context.ethName;
      let message, h;
      if (context.idsAsHex){
        message = pad32(contextName) + contextIds.map(addressToBytes32).join('');
      } else {
        message = pad32(contextName) + contextIds.map(pad32).join('');
      }
      message = Buffer.from(message, 'binary').toString('hex');
      // fix an issue with keccak256 using alloc on old arango
      if (!Buffer.prototype.alloc) {
        Buffer.prototype.alloc = function(size) { return new Buffer(size); }
      }
      h = new Uint8Array(createKeccakHash('keccak256').update(message, 'hex').digest());
      let ethPrivateKey = module.context.configuration.ethPrivateKey;
      ethPrivateKey = new Uint8Array(Buffer.from(ethPrivateKey, 'hex'));
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
        unique,
        context: contextName,
        contextIds: contextIds,
        sig,
        publicKey
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
      res.throw(500, 'Server setting "ip" not set', {errorNum: IP_NOT_SET});
    }
  },

  contexts: function contexts(req, res){
    const contextName = req.param('context');
    let context = db.getContext(contextName);
    if (! context) {
      res.throw(404, 'Context not found', {errorNum: CONTEXT_NOT_FOUND} );
    } else {
      res.send({
        "data": {
          verification: context.verification,
          verificationUrl: context.verificationUrl,
          isApp: context.isApp,
          appLogo: context.appLogo,
          appUrl: context.appUrl,
          unusedSponsorships: db.unusedSponsorship(contextName)
        }
      });
    }
  },

  allContexts: function allContexts(req, res){
    const contexts = db.getAllContexts();
    const result = []
    contexts.forEach(context => {
      result.push({
        name: context._key,
        unusedSponsorships: db.unusedSponsorship(context._key),
        assignedSponsorships: context.totalSponsorships
      })
    });
    res.send({
      "data": {
        contexts: result
      }
    });
  }
};

router.put('/operations/:hash', handlers.operationsPut)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .body(schemas.operation)
  .summary('Add an operation to be applied after consensus')
  .description('Add an operation be applied after consensus.')
  .response(null)
  .error(400, 'Failed to add the operation');

router.get('/users/:id', handlers.userGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .summary('Get information about a user')
  .description("Gets a user's score, verifications, joining date, lists of , current groups, eligible groups, and current connections.")
  .response(schemas.userGetResponse)
  .error(404, 'User not found');

router.get('/operations/:hash', handlers.operationGet)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .summary('Get state and result of an operation')
  .response(schemas.operationGetResponse)
  .error(404, 'Operation not found');

router.get('/verifications/:context/:contextId', handlers.verificationGet)
  .pathParam('context', joi.string().required().description('the context in which the user is verified'))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .queryParam('signed', joi.string().description('the value will be eth or nacl to indicate the type of signature returned'))
  .summary('Gets a signed verification')
  .description("Gets a signed verification for the user that is signed by the node")
  .response(schemas.verificationGetResponse)
  .error(403, 'user is not sponsored')
  .error(404, 'context, contextId or verification not found');

router.get('/verifications/:context', handlers.contextVerificationGet)
  .pathParam('context', joi.string().required().description('the context in which the user is verified'))
  .summary('Gets list of all of contextIds')
  .description("Gets list of all of contextIds in the context that are currently linked to unique humans")
  .response(schemas.contextVerificationGetResponse)
  .error(404, 'context not found');

router.get('/ip', handlers.ip)
  .summary("Get this server's IPv4 address")
  .response(schemas.ipGetResponse);

router.get('/contexts/:context', handlers.contexts)
  .pathParam('context', joi.string().required().description("Unique name of the context"))
  .summary("Get information about a context")
  .response(schemas.contextsGetResponse)
  .error(404, 'context not found');

router.get('/contexts', handlers.allContexts)
  .summary("Get all contexts")
  .response(schemas.allContextsGetResponse);

module.context.use(function (req, res, next) {
  const lastProcessedBlock = variablesColl.document('LAST_BLOCK').value;
  if (lastProcessedBlock >= 2900000) {
    return res.throw(404, 'v4 is not supported anymore! Please upgrade your client.');
  }

  try {
    next();
  } catch (e) {
    const notLogMessages = [
      "user can not be verified for this context",
      "contextId not found"
    ];
    if (notLogMessages.includes(e.message)){
      throw e;
    }
    console.group("Error returned");
    console.log('url:', req._raw.requestType, req._raw.url);
    console.log('error:', e);
    console.log('body:', req.body);
    console.groupEnd();
    throw e;
  }
});

module.exports = {
  handlers
};
