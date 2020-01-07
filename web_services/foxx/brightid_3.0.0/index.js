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
  uInt8ArrayToB64
} = require('./encoding');

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

const handlers = {
  operationsPut: function(req, res){
    const op = req.body;
    if (operationsHashesColl.exists(op._key)) {
      res.throw(400, 'operation is applied before');
    }
    try {
      operations.verify(op);
    } catch (e) {
      res.throw(400, e);
    }
    if (op.name == 'Verify Account') {
      operations.encrypt(op);  
    }
    op.state = 'init'
    db.upsertOperation(op);
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
    const timestamp = req.header('x-brightid-timestamp');;
    const sig = req.header('x-brightid-signature');

    if (timestamp < Date.now() - TIME_FUDGE || timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "bad timestamp");
    }

    const message = 'Get User' + id + timestamp;
    try {
      operations.verifyUserSig(message, id, sig);
    } catch (e) {
      res.throw(403, e);
    }

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
        eligibleGroupsUpdated,
        eligibleGroups,
        currentGroups: db.loadGroups(currentGroups, connections, id),
        connections: db.loadUsers(connections),
        verifications: user.verifications
      }
    });
  },

  getSignedVerification: function(req, res){
    const id = req.param('id');
    const context = req.param('context');
    const sig = req.header('x-brightid-signature');
    const timestamp = req.header('x-brightid-timestamp');

    if (timestamp < Date.now() - TIME_FUDGE || timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "bad timestamp");
    }

    const message = 'Get Signed Verification' + id + context + timestamp;
    try {
      operations.verifyUserSig(message, id, sig);
    } catch (e) {
      res.throw(403, e);
    }

    const { collection } = db.getContext(context);
    const coll = arango._collection(collection);
    const v = db.latestVerificationById(coll, id);
    if (!v) {
      res.throw(403, 'no verified account linked to this id under this context');
    }

    // find old accounts for this id that aren't currently being used by someone else
    const revocableAccounts = db.revocableAccounts(coll, v.account, id);

    // sign and return the verification
    const verificationMessage = context + ',' + v.account + ',' + v.timestamp + (revocableAccounts.length ?  ',' + revocableAccounts.join(',') : '');

    if (!(module.context && module.context.configuration && module.context.configuration.publicKey && module.context.configuration.privateKey)){
      res.throw(500, 'Server node key pair not configured')
    }
    
    const nodePublicKey = module.context.configuration.publicKey;
    const nodePrivateKey = module.context.configuration.privateKey;
    const verificationSig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(verificationMessage), b64ToUint8Array(nodePrivateKey)))
    );

    res.send({
      data: {
        revocableAccounts,
        timestamp: v.timestamp,
        sig: verificationSig,
        publicKey: nodePublicKey
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
    const account = req.param('account');
    const timestamp = db.latestVerificationByAccount(context, account);
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

router.put('/operations', handlers.operationsPut)
  .body(joi.object())
  .summary('Add an operation to be applied after consensus')
  .description("Add an operation be applied after consensus.")
  .response(null);

router.get('/user/:id', handlers.userGet)
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .summary('Get information about a user')
  .header('x-brightid-signature', joi.string().required()
    .description('message ("Get User" + id) signed by the user represented by id'))
  .header('x-brightid-timestamp', joi.string().required())
  .description("Gets a user's score, verifications, lists of current groups, eligible groups, and current connections.")
  .response(schemas.fetchUserInfoPostResponse);

router.get('/signedVerification/:context/:id', handlers.getSignedVerification)
  .pathParam('context', joi.string().required().description('the context in which the user should be verified'))
  .pathParam('id', joi.string().required().description('the brightid of the user'))
  .header('x-brightid-signature', joi.string().required()
    .description('message ("Get Signed Verification" + id + context) signed by the user represented by id'))
  .header('x-brightid-timestamp', joi.string().required())
  .summary('Get a signed verification')
  .description("Gets a signed verification for the user that is signed by the node")
  .response(schemas.signedVerificationGetResponse);

router.get('/membership/:groupId', handlers.membershipGet)
  .pathParam('groupId', joi.string().required())
  .summary('Get group members')
  .description('Gets all members of a group.')
  .response(schemas.membershipGetResponse);

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

module.exports = {
  handlers
};
