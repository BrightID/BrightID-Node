'use strict';
const createRouter = require('@arangodb/foxx/router');
const contacts = require('./contactsGraph.js');
const router = createRouter();
const Joi = require('joi');
const nacl = require('tweetnacl');
const enc = require('./encoding.js');

module.context.use(router);

// low-level schemas
var schemas = {
  timestamp: Joi.number().integer().max(Date.now()).required()
};

// extend low-level schemas with high-level schemas
schemas = Object.assign({
  connectionsPutBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required();
    publicKey1: Joi.string().required(),
    publicKey2: Joi.string().required(),
    sig1: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey1'),
    sig2: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey2'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the connection occurred')
  }),
  connectionsDeleteBody: Joi.object({
    // Consider using this if they ever update Joi
    // publicKey1: Joi.string().base64().required();
    publicKey1: Joi.string().required(),
    publicKey2: Joi.string().required(),
    sig1: Joi.string().required()
      .description('message (publicKey1 + publicKey2 + timestamp) signed by the user represented by publicKey1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  })
}, schemas);

const handlers = {
  connectionsPut: function connectionsPutHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const timestamp =  req.body.timestamp;
    const message = enc.strToUint8Array(publicKey1 + publicKey2 + timestamp);

    //Verify signatures
    try {
      if (! nacl.sign.detached.verify(message, enc.b64ToUint8Array(req.body.sig1), enc.b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey + publicKey2 + timestamp signed by publicKey1");
      }
      if (! nacl.sign.detached.verify(message, enc.b64ToUint8Array(req.body.sig2), enc.b64ToUint8Array(publicKey2))){
        res.throw(403, "sig2 wasn't publicKey + publicKey2 + timestamp signed by publicKey2");
      }
    } catch (e) {
      res.throw(403, e);
    }
    contacts.addAndClean(publicKey1, publicKey2, timestamp);
    res.send('ok');
  },
  connectionsDelete: function connectionsDeleteHandler(req, res){
    const publicKey1 = req.body.publicKey1;
    const publicKey2 = req.body.publicKey2;
    const timestamp = req.body.timestamp;
    const message = enc.strToUint8Array(publicKey1 + publicKey2 + req.body.timestamp);

    //Verify signature
    try {
      if (! nacl.sign.detached.verify(message, enc.b64ToUint8Array(req.body.sig1), enc.b64ToUint8Array(publicKey1))){
        res.throw(403, "sig1 wasn't publicKey + publicKey2 + timestamp signed by publicKey1");
      }
    } catch (e) {
      res.throw(403, e);
    }
    contacts.removeAndClean(publicKey1, publicKey2, timestamp);
    res.send('ok');
  }
};

router.put('/connections/', handlers.connectionsPut)
  .body(schemas.connectionsPutBody.required())
  .summary('Add a connection')
  .description('Adds a connection.');

router.delete('/connections/', handlers.connectionsDelete)
  .body(schemas.connectionsDeleteBody.required())
  .summary('Remove a connection')
  .description('Removes a connection.');

module.exports = {
  schemas: schemas,
  handlers: handlers
};