'use strict';
const stringify = require('fast-json-stable-stringify');
const secp256k1 = require('secp256k1');
const createKeccakHash = require('keccak');
const BigInteger = require('jsbn').BigInteger;
const createRouter = require('@arangodb/foxx/router');
const _ = require('lodash');
const joi = require('joi');
const { db: arango, ArangoError } = require('@arangodb');
const nacl = require('tweetnacl');
const db = require('./db');
const schemas = require('./schemas').schemas;
const operations = require('./operations');
const WISchnorrServer  = require('./WISchnorrServer');
const WISchnorrClient  = require('./WISchnorrClient');
const crypto = require('@arangodb/crypto');
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
const signedVerificationsColl = arango._collection('signedVerifications');
const cachedParamsColl = arango._collection('cachedParams');
const appIdsColl = arango._collection('appIds');

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

    op.state = 'init';
    db.upsertOperation(op);

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
    const outboundConnections = db.userConnections(id, 'outbound').map(conn => {
      const u = db.userToDic(conn.id);
      u.level = conn.level;
      u.reportReason = conn.reportReason;
      return u;
    });
    const inboundConnections = db.userConnections(id, 'inbound').map(conn => {
      const u = db.userToDic(conn.id);
      u.level = conn.level;
      u.reportReason = conn.reportReason;
      return u;
    });
    let groups = db.userGroups(id);
    groups = groups.map(group => {
      const g = db.groupToDic(group.id);
      g.joined = group.timestamp;
      return g;
    });

    const invites = db.userInvites(id);

    res.send({
      data: {
        score: user.score,
        createdAt: user.createdAt,
        flaggers: db.getReporters(id),
        recoveryConnections: Object.values(db.getRecoveryConnections(id)),
        invites,
        groups,
        outboundConnections,
        inboundConnections,
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

  userEligibleGroupsToVouchGet: function(req, res) {
    const id = req.param('id');
    res.send({
      data: {
        groups: db.userEligibleGroupsToVouch(id)
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
        signingKeys: user.signingKeys,
        recoveryConnections: Object.values(db.getRecoveryConnections(id)),
      }
    });
  },

  verificationPublicGet: function(req, res){
    const appKey = req.param('app');
    const app = db.getApp(appKey);
    const roundedTimestamp = req.param('roundedTimestamp');
    const verification = req.param('verification');

    const vel = app.verificationExpirationLength;
    if (vel) {
      const serverRoundedTimestamp = parseInt(Date.now() / vel) * vel;
      if (serverRoundedTimestamp != roundedTimestamp) {
        throw new errors.InvalidRoundedTimestampError(serverRoundedTimestamp, roundedTimestamp);
      }
    }

    const info = stringify({ app: appKey, roundedTimestamp, verification });
    const server = new WISchnorrServer();
    const params = server.GenerateWISchnorrParams(info);
    const p = params.private;
    cachedParamsColl.insert({
      public: stringify(params.public),
      private: { u: p.u.toString(), s: p.s.toString(), d: p.d.toString() },
      app: appKey,
      roundedTimestamp,
      verification,
      creationDate: parseInt(Date.now() / 1000)
    });
    res.send({
      data: { public: params.public }
    });
  },

  verificationSigGet: function(req, res){
    const id = req.param('id');
    const sig = req.param('sig');
    const e = req.param('e');
    const pub = req.param('public');
    const params = db.getCachedParams(pub);
    const app = db.getApp(params.app);

    const msg = stringify({ id, 'public': JSON.parse(pub) });
    operations.verifyUserSig(msg, id, sig);

    let verifications = db.userVerifications(id);
    verifications = _.keyBy(verifications, v => v.name);
    let verified;
    try {
      let expr = parser.parse(params.verification);
      for(let v of expr.variables()) {
        if (!verifications[v]) {
          verifications[v] = false;
        }
      }
      verified = expr.evaluate(verifications);
    } catch (err) {
      throw new errors.InvalidExpressionError(app.name, params.verification, err);
    }
    if (! verified) {
      throw new errors.NotVerifiedError(params.app, params.verification);
    }

    if (! (module.context && module.context.configuration && module.context.configuration.wISchnorrPassword)){
      throw new errors.WISchnorrPasswordNotSetError();
    }

    const password = module.context.configuration.wISchnorrPassword;
    const server = new WISchnorrServer();
    server.GenerateSchnorrKeypair(password);

    const q = { id, roundedTimestamp: params.roundedTimestamp, app: params.app, verification: params.verification };
    const sv = signedVerificationsColl.firstExample(q);
    if (sv) {
      throw new errors.DuplicateSigRequestError();
    }
    signedVerificationsColl.insert(q);

    let priv = params.private;
    priv = {
      u: new BigInteger(priv.u),
      s: new BigInteger(priv.s),
      d: new BigInteger(priv.d),
    };
    const response = server.GenerateWISchnorrServerResponse(priv, e);
    res.send({
      data: {
        response
      }
    });
  },

  verificationAppIdPost: function(req, res){
    const app = req.param('app');
    const appId = req.param('appId');
    const { sig, verification, roundedTimestamp, uid } = req.body;
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    const info = { app, verification, roundedTimestamp };
    const result = client.VerifyWISchnorrBlindSignature(sig, stringify(info), uid);
    if (! result) {
      throw new errors.InvalidSignatureError();
    };
    db.insertAppIdVerification(app, uid, appId, verification, roundedTimestamp);
  },

  verificationGet: function(req, res){
    let unique = true;
    const appId = req.param('appId');
    const appKey = req.param('app');
    const signed = req.param('signed');
    let timestamp = req.param('timestamp');
    const verification = req.param('verification');
    const app = db.getApp(appKey);

    const doc = appIdsColl.firstExample({ app: appKey, appId });
    if (!doc || !doc.verifications.includes(verification)) {
      throw new errors.NotVerifiedError(appKey, verification);
    }

    if (timestamp == 'seconds' && app.roundedTimestamp) {
      timestamp = parseInt(app.roundedTimestamp / 1000);
    } else if (timestamp == 'milliseconds' && app.roundedTimestamp) {
      timestamp = app.roundedTimestamp;
    } else {
      timestamp = undefined;
    }

    // sign and return the verification
    const verificationHash = crypto.sha256(verification);
    let sig, publicKey;
    if (signed == 'nacl') {
      if (! (module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey)){
        throw new errors.KeypairNotSetError();
      }

      let message = appKey + ',' + appId + ',' + verificationHash;
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
      if (app.idsAsHex) {
        message = pad32(appKey) + addressToBytes32(appId);
      } else {
        message = pad32(appKey) + pad32(appId);
      }
      message = Buffer.from(message, 'binary').toString('hex');
      message += verificationHash;
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
        appId: appId,
        verificationHash,
        sig,
        timestamp,
        publicKey
      }
    });
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
      data: {
        apps
      }
    });
  },

  stateGet: function(req, res){
    res.send({
      data: db.getState()
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
        admins: group.admins,
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
  .description("Gets a user's score, verifications, joining date, lists of connections and groups.")
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
  .summary('Gets inbound or outbound connections of a user')
  .description("Gets list of user's connections with levels and timestamps")
  .response(schemas.userConnectionsGetResponse);

router.get('/users/:id/eligibleGroupsToVouch', handlers.userEligibleGroupsToVouchGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .summary('Get a list of the family groups')
  .description("Get the list of family groups which the user can evaluate them")
  .response(schemas.userEligibleGroupsToVouchGetResponse);

router.get('/operations/:hash', handlers.operationGet)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .summary('Gets state and result of an operation')
  .response(schemas.operationGetResponse)
  .error(404, 'Operation not found');

router.get('/verifications/blinded/public', handlers.verificationPublicGet)
  .queryParam('app', joi.string().required().description('unique app id'))
  .queryParam('roundedTimestamp', joi.number().integer().required().description("timestamp that is rounded to app's required precision"))
  .queryParam('verification', joi.string().description('custom verification expression'))
  .summary('Gets public part of WI-Schnorr params')
  .description("Gets public part of WI-Schnorr params using deterministic json representation of {app, roundedTimestamp, verification} as info")
  .response(schemas.verificationPublicGetResponse)
  .error(404, 'app not found')
  .error(403, 'invalid rounded timestamp');

router.get('/verifications/blinded/sig/:id', handlers.verificationSigGet)
  .pathParam('id', joi.string().required().description('the brightid of the user requesting the verification'))
  .queryParam('public', joi.string().required().description('public part of WI-Schnorr params'))
  .queryParam('sig', joi.string().description('deterministic json representation of {id, public} signed by the user represented by id'))
  .queryParam('e', joi.string().required().description('the e part of WI-Schnorr challenge generated by client using public provided by node'))
  .summary('Gets WI-Schnorr server response')
  .description('Gets WI-Schnorr server response that will be used by client to generate final signature to be shared with the app')
  .response(schemas.verificationSigGetResponse)
  .error(403, 'user is not sponsored')
  .error(404, 'app not found')
  .error(403, 'invalid rounded timestamp');

router.post('/verifications/:app/:appId', handlers.verificationAppIdPost)
  .pathParam('app', joi.string().required().description('the app that user is verified for'))
  .pathParam('appId', joi.string().required().description('the id of the user within the app'))
  .body(schemas.verificationAppIdPostBody)
  .summary('Posts an unblinded signature')
  .description('Clients use this endpoint to add unblinded signature for an appId to the node to be queried by apps')
  .response(null);

router.get('/verifications/:app/:appId/:verification', handlers.verificationGet)
  .pathParam('app', joi.string().required().description('the app that user is verified for'))
  .pathParam('appId', joi.string().required().description('the id of user within the app'))
  .queryParam('verification', joi.string().description('custom verification expression'))
  .queryParam('signed', joi.string().description('the value will be eth or nacl to indicate the type of signature returned'))
  .queryParam('timestamp', joi.string().description('request a timestamp of the specified format to be added to the response. Accepted values: "seconds", "milliseconds"'))
  .summary('Gets a signed verification')
  .description('Apps use this endpoint to query a signed verification for an appId from the node')
  .response(schemas.verificationGetResponse)
  .error(403, 'user is not sponsored')
  .error(404, 'appId not found');

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

router.get('/groups/:id', handlers.groupGet)
  .pathParam('id', joi.string().required().description('the id of the group'))
  .summary('Get information about a group')
  .description("Gets a group's admins, info, region, seed, type, url, timestamp, members and invited list.")
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
