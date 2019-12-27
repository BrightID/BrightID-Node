'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const arango = require('@arangodb').db;
const db = require('./db');
const schemas = require('./schemas').schemas;
const operations = require('./operations');

const router = createRouter();
module.context.use(router);
const handlers = {
  addOperation: function(req, res){
    const op = req.body;
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

  applyOperation: function(req, res){
    const consensusAPIKey = ((module.context && module.context.configuration && module.context.configuration.consensusAPIKey) || '');
    if (!consensusAPIKey) {
      res.throw(500, 'Server node consensus api key not configured');
    }
    if (req.header('CONSENSUS-API-KEY') != consensusAPIKey) {
      res.throw(403, 'invalid consensus api key');
    }
    const op = req.body;
    if (op.name == 'Verify Account') {
      operations.decrypt(op);
    }
    try {
      operations.verify(op);
      op.result = operations.apply(op);
      op.state = 'applied';
    } catch (e) {
      op.state = 'failed';
      op.result = e + (e.stack ? '\n' + e.stack : '');
    }
    if (op.name == 'Verify Account') {
      operations.encrypt(op);
    }
    db.upsertOperation(op);
    res.send({'success': true});
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

  fetchUserInfo: function usersHandler(req, res){
    const id = req.body.id;
    const timestamp = req.body.timestamp;

    if (timestamp > Date.now() + TIME_FUDGE) {
      res.throw(400, "timestamp can't be in the future");
    }

    const message = id + timestamp;
    const e = "sig wasn't id + timestamp signed by the user represented by id";
    verifyUserSig(message, id, req.body.sig, res, e);

    const connections = db.userConnections(id);
    const user = db.loadUser(id);
    if (! user) {
      res.throw(404, "User not found");
    }

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

// get requests will return results instantly

router.post('/addOperation/', handlers.addOperation)
  .body(joi.object().required())
  .summary('Add an operation to be applied after consensus')
  .description("Add an operation be applied after consensus.")
  .response(null);

router.post('/applyOperation/', handlers.applyOperation)
  .body(joi.object().required())
  .summary('Apply operation after consensus')
  .description("Apply operation after consensus.")
  .response(null);

router.get('/fetchUserInfo/', handlers.fetchUserInfo)
  .body(schemas.fetchUserInfoPostBody.required())
  .summary('Get information about a user')
  .description("Gets a user's score, verifications, lists of current groups, eligible groups, and current connections.")
  .response(schemas.fetchUserInfoPostResponse);

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
