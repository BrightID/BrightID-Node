'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const arango = require('@arangodb').db;
const nacl = require('tweetnacl');
const db = require('./db');
const operations = require('./operations');
const schemas = require('./schemas').schemas;

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');

const handlers = {
  operationsPut: function(req, res){
    const op = req.body;
    const hash = req.param('hash');
    op.hash = hash;
    // decrypt first to fix the hash
    if (op.name == 'Link ContextId') {
      operations.decrypt(op);
    }

    if (operationsHashesColl.exists(op.hash)) {
      return res.send({'success': true, 'state': 'duplicate'});
    }
    operationsHashesColl.insert({ _key: op.hash });

    try {
      operations.verify(op);
      op.result = operations.apply(op);
      op.state = 'applied';
    } catch (e) {
      op.state = 'failed';
      op.result = e + (e.stack ? '\n' + e.stack : '');
    }
    if (op.name == 'Link ContextId') {
      operations.encrypt(op);
    }
    db.upsertOperation(op);
    res.send({'success': true, 'state': op.state, 'result': op.result});
  }
};

router.put('/operations/:hash', handlers.operationsPut)
  .pathParam('hash', joi.string().required().description('sha256 hash of the operation message'))
  .body(schemas.operation)
  .summary('Apply operation after consensus')
  .description("Apply operation after consensus.")
  .response(null);

module.context.use(function (req, res, next) {
  try {
    next();
  } catch (e) {
    console.group("Error returned");
    console.log('url:', req._raw.requestType, req._raw.url);
    console.log('error:', e);
    console.log('body:', req.body);
    console.groupEnd();
    throw e;
  }
});
