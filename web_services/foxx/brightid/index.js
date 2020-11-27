'use strict';
const secp256k1 = require('secp256k1');
const createKeccakHash = require('keccak');

const createRouter = require('@arangodb/foxx/router');
const _ = require('lodash');
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
  addressToBytes32,
} = require('./encoding');
const parser = require('expr-eval').Parser;

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');

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
const APP_NOT_FOUND = 12;
const INVALID_EXPRESSION = 13;
const INVALID_TESTING_KEY = 14;

const handlers = {
  operationsPost: function(req, res){
    const op = req.body;
    const message = operations.getMessage(op);
    op.hash = hash(message);
    if (operationsHashesColl.exists(op.hash)) {
      res.throw(400, 'operation was applied before');
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
        // Sponsor operation hash will be chaned by above update
        if (operationsHashesColl.exists(op.hash)) {
          res.throw(400, 'operation was applied before');
        }
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
    res.send({
      data: {
        // use hash(message) not op.hash to return original operation hash
        // for Sponsor instead of updated one that have id instead of contextId
        hash: hash(message)
      }
    });
  },

  operationGet: function(req, res){
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

  userGet: function(req, res){
    const id = req.param('id');
    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found", {errorNum: USER_NOT_FOUND});
    }

    const verifications = db.userVerifications(id).map(v => v.name);

    let connections = db.userConnections(id);
    const connectionsMap = _.keyBy(connections, conn => conn.id);
    connections = connections.map(conn => {
      const u = db.userToDic(conn.id);
      u.level = connectionsMap[conn.id].level;
      u.reportReason = connectionsMap[conn.id].reportReason;
      return u;
    });

    let groups = db.userGroups(id);
    groups = groups.map(group => {
      const g = db.groupToDic(group.id);
      g.joined = group.timestamp;
      return g;
    });

    const invites = db.userInvitedGroups(id);
    db.updateEligibleGroups(id, connections, groups);

    res.send({
      data: {
        score: user.score,
        createdAt: user.createdAt,
        flaggers: db.getReporters(id),
        trusted: db.getRecoveryConnections(id),
        invites,
        groups,
        connections,
        verifications,
        isSponsored: db.isSponsored(id)
      }
    });

  },

  userConnectionsGet: function(req, res) {
    const id = req.param('id');
    const direction = req.param('direction');
    res.send({
      data: {
        connections: db.userConnections(id, direction)
      }
    });
  },

  userVerificationsGet: function(req, res) {
    const id = req.param('id');
    res.send({
      data: {
        verifications: db.userVerifications(id)
      }
    });
  },

  userProfileGet: function(req, res) {
    const id = req.param('id');
    const requestor = req.param('requestor');
    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found", {errorNum: USER_NOT_FOUND});
    }

    const verifications = db.userVerifications(id);
    const connections = db.userConnections(id, 'inbound');
    const groups = db.userGroups(id);
    const requestorConnections = db.userConnections(requestor, 'outbound');
    const requestorGroups = db.userGroups(requestor);

    const isKnown = c => ['just met', 'already known', 'recovery'].includes(c.level);
    const connectionsNum = connections.filter(isKnown).length;
    const groupsNum = groups.length;
    const mutualConnections = _.intersection(
      connections.filter(isKnown).map(c => c.id),
      requestorConnections.filter(isKnown).map(c => c.id)
    );
    const mutualGroups = _.intersection(
      groups.map(g => g.id),
      requestorGroups.map(g => g.id)
    );

    const conn = connections.find(c => c.id === requestor);
    const connectedAt = conn ? conn.timestamp: 0;
    const reports = connections.filter(c => c.level === 'reported').map(c => {
      return {
        id: c.id,
        reportReason: c.reportReason
      }
    });

    res.send({
      data: {
        connectionsNum,
        groupsNum,
        mutualConnections,
        mutualGroups,
        connectedAt,
        createdAt: user.createdAt,
        reports,
        verifications
      }
    });
  },

  allVerificationsGet: function(req, res){
    const contextName = req.param('context');
    const count_only = 'count_only' in req.queryParams;
    const context = db.getContext(contextName);
    if (! context) {
      res.throw(404, 'context not found', {errorNum: CONTEXT_NOT_FOUND});
    }

    const coll = arango._collection(context.collection);
    let contextIds = db.getLastContextIds(coll, context.verification);
    let data = {
      count: contextIds.length
    }
    if (! count_only){
      data['contextIds'] = contextIds
    }
    res.send({
      data
    });
  },

  verificationGet: function(req, res){
    let unique = true;
    let contextId = req.param('contextId');
    let appKey = req.param('app');
    const signed = req.param('signed');
    let timestamp = req.param('timestamp');
    const app = db.getApp(appKey);
    if (! app) {
      res.throw(404, 'app not found', {errorNum: APP_NOT_FOUND});
    }

    const context = db.getContext(app.context);
    if (! context) {
      res.throw(404, 'context not found', {errorNum: CONTEXT_NOT_FOUND});
    }

    const testblocks = db.getTestblocks(appKey, contextId);
    if (testblocks.includes('link')) {
      res.throw(404, 'contextId not found', {errorNum: CONTEXTID_NOT_FOUND});
    } else if (testblocks.includes('sponsorship')) {
      res.throw(403, 'user is not sponsored', {errorNum: NOT_SPONSORED});
    } else if (testblocks.includes('verification')) {
      res.throw(404, 'user can not be verified for this app', {errorNum: CAN_NOT_BE_VERIFIED});
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

    let verifications = db.userVerifications(user);
    verifications = _.keyBy(verifications, v => v.name);
    let verified;
    try {
      let expr = parser.parse(app.verification);
      for(let v of expr.variables()) {
        if (!verifications[v]) {
          verifications[v] = false;
        }
      }
      verified = expr.evaluate(verifications);
    } catch (err) {
      res.throw(404, 'invalid verification expression', {errorNum: INVALID_EXPRESSION});
    }
    if (! verified) {
      res.throw(404, 'user can not be verified for this app', {errorNum: CAN_NOT_BE_VERIFIED});
    }

    let contextIds = db.getContextIdsByUser(coll, user);
    if (contextId != contextIds[0]) {
      unique = false;
    }

    if (timestamp == 'seconds') {
      timestamp = parseInt(Date.now() / 1000);
    } else if (timestamp == 'milliseconds') {
      timestamp = Date.now();
    } else {
      timestamp = undefined;
    }

    // sign and return the verification
    let sig, publicKey;
    if (signed == 'nacl') {
      if (! (module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey)){
        res.throw(500, 'Server setting key pair not set', {errorNum: KEYPAIR_NOT_SET});
      }

      let message = appKey + ',' + contextIds.join(',');
      if (timestamp) {
        message = message + ',' + timestamp;
      }
      const privateKey = module.context.configuration.privateKey;
      publicKey = module.context.configuration.publicKey;
      sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(privateKey)))
      );
    } else if (signed == 'eth') {
      if (! (module.context && module.context.configuration && module.context.configuration.ethPrivateKey)){
        res.throw(500, 'Server setting "ethPrivateKey" not set', {errorNum: ETHPRIVATEKEY_NOT_SET});
      }

      let message, h;
      if (context.idsAsHex) {
        message = pad32(appKey) + contextIds.map(addressToBytes32).join('');
      } else {
        message = pad32(appKey) + contextIds.map(pad32).join('');
      }
      message = Buffer.from(message, 'binary').toString('hex');
      if (timestamp) {
        const t = timestamp.toString(16);
        message += ('0'.repeat(64 - t.length) + t);
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
        app: appKey,
        context: app.context,
        contextIds: contextIds,
        sig,
        timestamp,
        publicKey
      }
    });
  },

  ipGet: function(req, res){
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

  appGet: function(req, res){
    const appKey = req.param('app');
    let app = db.getApp(appKey);
    if (! app) {
      res.throw(404, 'App not found', {errorNum: APP_NOT_FOUND} );
    } else {
      res.send({
        "data": db.appToDic(app)
      });
    }
  },

  allAppsGet: function(req, res){
    const apps = db.getApps().map(app => db.appToDic(app));
    apps.sort((app1, app2) => {
      const used1 = app1.assignedSponsorships - app1.unusedSponsorships;
      const unused1 = app1.unusedSponsorships;
      const used2 = app2.assignedSponsorships - app2.unusedSponsorships;
      const unused2 = app2.unusedSponsorships;
      return (unused2 * used2) - (unused1 * used1);
    });
    res.send({
      "data": {
        apps
      }
    });
  },

  stateGet: function(req, res){
    res.send({
      "data": db.getState()
    });
  },

  testblocksPut: function(req, res){
    const appKey = req.param('app');
    const action = req.param('action');
    const contextId = req.param('contextId');
    const testingKey = req.param('testingKey');

    const app = db.getApp(appKey);
    if (! app) {
      res.throw(404, 'app not found', {errorNum: APP_NOT_FOUND});
    }
    if (app.testingKey != testingKey) {
      res.throw(404, 'invalid testingKey', {errorNum: INVALID_TESTING_KEY});
    }

    return db.addTestblock(contextId, action, appKey);
  },

  testblocksDelete: function(req, res){
    const appKey = req.param('app');
    const action = req.param('action');
    const contextId = req.param('contextId');
    const testingKey = req.param('testingKey');

    const app = db.getApp(appKey);
    if (! app) {
      res.throw(404, 'app not found', {errorNum: APP_NOT_FOUND});
    }
    if (app.testingKey != testingKey) {
      res.throw(404, 'invalid testingKey', {errorNum: INVALID_TESTING_KEY});
    }

    return db.removeTestblock(contextId, action, appKey);
  }

};

router.post('/operations', handlers.operationsPost)
  .body(schemas.operation)
  .summary('Add an operation to be applied after consensus')
  .description('Add an operation be applied after consensus.')
  .response(schemas.operationPostResponse)
  .error(400, 'Failed to add the operation');

router.get('/users/:id', handlers.userGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .summary('Get information about a user')
  .description("Gets a user's score, verifications, joining date, lists of connections, groups and eligible groups.")
  .response(schemas.userGetResponse)
  .error(404, 'User not found');

router.get('/users/:id/verifications', handlers.userVerificationsGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .summary('Get verifications of a user')
  .description("Gets list of user's verification objects with their properties")
  .response(schemas.userVerificationsGetResponse);

router.get('/users/:id/profile/:requestor', handlers.userProfileGet)
  .pathParam('id', joi.string().required().description('the brightid of the user that info requested about'))
  .pathParam('requestor', joi.string().required().description('the brightid of the user that requested info'))
  .summary('Get profile information of a user')
  .response(schemas.userProfileGetResponse)
  .error(404, 'User not found');

router.get('/users/:id/connections/:direction', handlers.userConnectionsGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .pathParam('direction', joi.string().required().valid('inbound', 'outbound').description('the direction of the connection'))
  .summary('Get inbound or outbound connections of a user')
  .description("Gets list of user's connections with levels and timestamps")
  .response(schemas.userConnectionsGetResponse);

router.get('/operations/:hash', handlers.operationGet)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .summary('Get state and result of an operation')
  .response(schemas.operationGetResponse)
  .error(404, 'Operation not found');

router.get('/verifications/:app/:contextId', handlers.verificationGet)
  .pathParam('app', joi.string().required().description('the app that user is verified for'))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .queryParam('signed', joi.string().description('the value will be eth or nacl to indicate the type of signature returned'))
  .queryParam('timestamp', joi.string().description('request a timestamp of the specified format to be added to the response. Accepted values: "seconds", "milliseconds"'))
  .summary('Gets a signed verification')
  .description("Gets a signed verification for the user that is signed by the node")
  .response(schemas.verificationGetResponse)
  .error(403, 'user is not sponsored')
  .error(404, 'context, contextId or verification not found');

router.get('/verifications/:context', handlers.allVerificationsGet)
  .pathParam('context', joi.string().required().description('the context in which the user is verified'))
  .summary('Gets list of all of contextIds')
  .description("Gets list of all of contextIds in the context that are currently linked to unique humans")
  .response(schemas.allVerificationsGetResponse)
  .error(404, 'context not found');

router.get('/ip', handlers.ipGet)
  .summary("Get this server's IPv4 address")
  .response(schemas.ipGetResponse);

router.get('/apps/:app', handlers.appGet)
  .pathParam('app', joi.string().required().description("Unique name of the app"))
  .summary("Get information about an app")
  .response(schemas.appGetResponse)
  .error(404, 'app not found');

router.get('/apps', handlers.allAppsGet)
  .summary("Get all apps")
  .response(schemas.allAppsGetResponse);

router.get('/state', handlers.stateGet)
  .summary("Get state of this node")
  .response(schemas.stateGetResponse);

router.put('/testblocks/:app/:action/:contextId', handlers.testblocksPut)
  .pathParam('app', joi.string().required().description("The key of app"))
  .pathParam('action', joi.string().required().description("The action name"))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .queryParam('testingKey', joi.string().required().description('the secret key for testing the app'))
  .summary("Block user's verification for testing.")
  .description('Updating state of contextId to be considered as unsponsored, unlinked or unverified temporarily for testing.')
  .response(null);

router.delete('/testblocks/:app/:action/:contextId', handlers.testblocksDelete)
  .pathParam('app', joi.string().required().description("Unique name of the app"))
  .pathParam('action', joi.string().required().description("The action name"))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .queryParam('testingKey', joi.string().description('the testing private key of the app'))
  .summary("Remove blocking state applied on user's verification for testing.")
  .description("Remove limitations applied to a contextId to be considered as unsponsored, unlinked or unverified temporarily for testing.")

module.context.use(function (req, res, next) {
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
