'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const arango = require('@arangodb').db;
const nacl = require('tweetnacl');
const db = require('./db');
const operations = require('./operations');

const router = createRouter();
module.context.use(router);
const operationsHashesColl = arango._collection('operationsHashes');

const handlers = {
  operationsPut: function(req, res){
    const op = req.body;

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

router.put('/operations', handlers.operationsPut)
  .body(joi.object().required())
  .summary('Apply operation after consensus')
  .description("Apply operation after consensus.")
  .response(null);
