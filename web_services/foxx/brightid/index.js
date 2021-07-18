'use strict';
const secp256k1 = require('secp256k1');
const createKeccakHash = require('keccak');
const createRouter = require('@arangodb/foxx/router');
const _ = require('lodash');
const joi = require('joi');
const { db: arango, ArangoError } = require('@arangodb');
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
const errors = require('./errors');

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences
const MAX_OP_SIZE = 2000;

const handlers = {
  operationsPost: function(req, res){
    const op = req.body;
    const message = operations.getMessage(op);
    op.hash = hash(message);

    if (operationsHashesColl.exists(op.hash)) {
      throw new errors.OperationAppliedBeforeError(op.hash);
    } else if (JSON.stringify(op).length > MAX_OP_SIZE) {
      throw new errors.TooBigOperationError(MAX_OP_SIZE);
    }

    // verify signature
    operations.verify(op);

    // allow limited number of operations to be posted in defined time window
    const timeWindow = module.context.configuration.operationsTimeWindow * 1000;
    const limit = module.context.configuration.operationsLimit;
    operations.checkLimits(op, timeWindow, limit);

    if (op.name == 'Link ContextId') {
      operations.encrypt(op);
    }

    if (op.name == 'Sponsor') {
      db.sponsor(op);
    } else {
      op.state = 'init';
      db.upsertOperation(op);
    }

    res.send({
      data: {
        hash: op.hash
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
      throw new errors.OperationNotFoundError(hash);
    }
  },

  userGet: function(req, res){
    const id = req.param('id');
    const user = db.loadUser(id);
    if (! user) {
      throw new errors.UserNotFoundError(id);
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
    // this is deprecated and will be removed on v6
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
        isSponsored: db.isSponsored(id),
        signingKeys: user.signingKeys
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
      throw new errors.UserNotFoundError(id);
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
        verifications,
        signingKeys: user.signingKeys
      }
    });
  },

  allVerificationsGet: function(req, res){
    const appKey = req.param('app');
    const count_only = 'count_only' in req.queryParams;
    const app = db.getApp(appKey);
    const context = db.getContext(app.context);
    const coll = arango._collection(context.collection);
    let contextIds = db.getLastContextIds(coll, app._key);
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
    const verification = req.param('verification');
    const app = db.getApp(appKey);
    const context = db.getContext(app.context);
    if (context.idsAsHex) {
      contextId = contextId.toLowerCase();
    }
    const testblocks = db.getTestblocks(appKey, contextId);

    if (testblocks.includes('link')) {
      throw new errors.ContextIdNotFoundError(contextId);
    } else if (testblocks.includes('sponsorship')) {
      throw new errors.NotSponsoredError(contextId);
    } else if (testblocks.includes('verification')) {
      throw new errors.NotVerifiedError(contextId, appKey);
    }

    const coll = arango._collection(context.collection);
    const user = db.getUserByContextId(coll, contextId);
    if (! user) {
      throw new errors.ContextIdNotFoundError(contextId);
    }

    if (! db.isSponsored(user)) {
      throw new errors.NotSponsoredError(contextId);
    }

    let verifications = db.userVerifications(user);
    verifications = _.keyBy(verifications, v => v.name);
    let verified;
    try {
      let expr = parser.parse(verification || app.verification);
      for(let v of expr.variables()) {
        if (!verifications[v]) {
          verifications[v] = false;
        }
      }
      verified = expr.evaluate(verifications);
    } catch (err) {
      throw new errors.InvalidExpressionError(app.name, app.verification, err);
    }
    if (! verified) {
      throw new errors.NotVerifiedError(contextId, appKey);
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
        throw new errors.KeypairNotSetError();
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
        throw new errors.EthPrivatekeyNotSetError();
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
      throw new errors.IpNotSetError();
    }
  },

  appGet: function(req, res){
    const appKey = req.param('app');
    let app = db.getApp(appKey);
    res.send({
      "data": db.appToDic(app)
    });
  },

  allAppsGet: function(req, res){
    const apps = db.getApps().map(app =>  db.appToDic(app));
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
    let contextId = req.param('contextId');
    const testingKey = req.param('testingKey');

    const app = db.getApp(appKey);
    if (app.testingKey != testingKey) {
      throw new errors.InvalidTestingKeyError();
    }
    const context = db.getContext(app.context);
    if (context.idsAsHex) {
      if(!db.isEthereumAddress(contextId)) {
        throw new errors.InvalidContextIdError(contextId);
      }
      contextId = contextId.toLowerCase();
    }

    return db.addTestblock(contextId, action, appKey);
  },

  testblocksDelete: function(req, res){
    const appKey = req.param('app');
    const action = req.param('action');
    let contextId = req.param('contextId');
    const testingKey = req.param('testingKey');

    const app = db.getApp(appKey);
    if (app.testingKey != testingKey) {
      throw new errors.InvalidTestingKeyError();
    }
    const context = db.getContext(app.context);
    if (context.idsAsHex) {
      if(!db.isEthereumAddress(contextId)) {
        throw new errors.InvalidContextIdError(contextId);
      }
      contextId = contextId.toLowerCase();
    }
    return db.removeTestblock(contextId, action, appKey);
  },

  contextDumpGet: function(req, res){
    const contextKey = req.param('context');
    const passcode = req.queryParams['passcode'];
    const context = db.getContext(contextKey);

    if (! context.passcode) {
      throw new errors.PasscodeNotSetError(contextKey);
    }
    if (context.passcode != passcode) {
      throw new errors.InvalidPasscodeError();
    }

    const coll = arango._collection(context.collection);
    const contextIds = db.getContextIds(coll);
    db.removePasscode(contextKey);
    res.send({
      data: {
        collection: context.collection,
        idsAsHex: context.idsAsHex,
        linkAESKey: context.linkAESKey,
        contextIds
      }
    });
  },

  groupGet: function(req, res){
    const id = req.param('id');
    const group = db.loadGroup(id);
    if (! group) {
      throw new errors.GroupNotFoundError(id);
    }

    res.send({
      data: {
        members: db.groupMembers(id),
        invites: db.groupInvites(id),
        // the eligibles is deprecated and will be removed on v6
        eligibles: db.updateEligibles(id),
        admins: group.admins,
        founders: group.founders,
        isNew: group.isNew,
        seed: group.seed || false,
        region: group.region,
        type: group.type || 'general',
        url: group.url,
        info: group.info,
        timestamp: group.timestamp,
      }
    });
  },
};

router.post('/operations', handlers.operationsPost)
  .body(schemas.operation)
  .summary('Add an operation to be applied after consensus')
  .description('Add an operation be applied after consensus.')
  .response(schemas.operationPostResponse)
  .error(400, 'Failed to add the operation')
  .error(403, 'Bad signature')
  .error(429, 'Too Many Requests');

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
  .queryParam('verification', joi.string().description('the verification expression'))
  .queryParam('signed', joi.string().description('the value will be eth or nacl to indicate the type of signature returned'))
  .queryParam('timestamp', joi.string().description('request a timestamp of the specified format to be added to the response. Accepted values: "seconds", "milliseconds"'))
  .summary('Gets a signed verification')
  .description("Gets a signed verification for the user that is signed by the node")
  .response(schemas.verificationGetResponse)
  .error(403, 'user is not sponsored')
  .error(404, 'context, contextId or verification not found');

router.get('/verifications/:app', handlers.allVerificationsGet)
  .pathParam('app', joi.string().required().description('the app for which the user is verified'))
  .summary('Gets list of all of contextIds verifed for an app')
  .description("Gets list of all of contextIds in the context that are sponsored and verified for using an app")
  .response(schemas.allVerificationsGetResponse)
  .error(404, 'context not found');

// this route is deprecated and will be removed on v6
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
  .pathParam('action', joi.string().valid('sponsorship', 'link', 'verification').required().description("The action name"))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .queryParam('testingKey', joi.string().required().description('the secret key for testing the app'))
  .summary("Block user's verification for testing")
  .description('Updating state of contextId to be considered as unsponsored, unlinked or unverified temporarily for testing')
  .response(null);

router.delete('/testblocks/:app/:action/:contextId', handlers.testblocksDelete)
  .pathParam('app', joi.string().required().description("Unique name of the app"))
  .pathParam('action', joi.string().required().valid('sponsorship', 'link', 'verification').description("The action name"))
  .pathParam('contextId', joi.string().required().description('the contextId of user within the context'))
  .queryParam('testingKey', joi.string().description('the testing private key of the app'))
  .summary("Remove blocking state applied on user's verification for testing")
  .description("Remove limitations applied to a contextId to be considered as unsponsored, unlinked or unverified temporarily for testing")
  .response(null);

router.get('/contexts/:context/dump', handlers.contextDumpGet)
  .pathParam('context', joi.string().required().description('the context key'))
  .queryParam('passcode', joi.string().required().description('the one time passcode that authorize access to this endpoint once'))
  .summary("Get dump of a context")
  .description('Get all required info to transfer a context to a new node')
  .response(schemas.contextDumpGetResponse)
  .error(404, 'context not found')
  .error(403, 'passcode not set')
  .error(403, 'incorrect passcode');

router.get('/groups/:id', handlers.groupGet)
  .pathParam('id', joi.string().required().description('the id of the group'))
  .summary('Get information about a group')
  .description("Gets a group's admins, founders, info, isNew, region, seed, type, url, timestamp, members, invited and eligible members.")
  .response(schemas.groupGetResponse)
  .error(404, 'Group not found');

module.context.use(function (req, res, next) {
  try {
    next();
  } catch (e) {
    if (! (e instanceof errors.NotFoundError)){
      console.group("Error returned");
      console.log('url:', req._raw.requestType, req._raw.url);
      console.log('error:', e);
      console.log('body:', req.body);
      console.groupEnd();
    }
    let options = undefined;
    if (e instanceof ArangoError) {
      options = { extra: { arangoErrorNum: e.errorNum }};
      e.errorNum = errors.ARANGO_ERROR;
    }
    res.throw(e.code || 500, e, options);
  }
});

module.exports = {
  handlers
};
