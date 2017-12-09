"use strict";

//maybe one day they'll fix their bundled chai module
//const expect = require('chai').expect;

const router = require('../index.js');
const Joi = require('joi');
const assert = require('assert');

describe('schemas', function(){
    describe('timestamp', function(){
      it('should accept a value in the past', function(){
        Joi.assert(1101801600000, router.schemas.timestamp);
      });
      it('should not accept a value in the future', function(){
        const result = router.schemas.timestamp.validate(8234567890123456);
        assert.notEqual(result.error, null);
      });
    });
});

describe('handlers', function(){
    describe('connectionsPut', function(){
      // TODO: make tests using a sinon stub for res with "send" and "throw" for various good and bad inputs
    });
});

