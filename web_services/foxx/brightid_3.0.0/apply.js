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
    op._key = hash;
    
    if (operationsHashesColl.exists(op._key)) {
      return res.send({'success': true, 'state': 'duplicate'});
    }
    operationsHashesColl.insert({ _key: op._key });

    if (op.name == 'Link ContextId') {
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
