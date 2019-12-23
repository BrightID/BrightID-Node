"use strict";

const enc = require('../encoding.js');
const nacl = require('tweetnacl');
const chai = require('chai');
const should = chai.should();
const expect = chai.expect;

const b64ToUint8Array = enc.b64ToUint8Array;
const strToUint8Array = enc.strToUint8Array;


describe('encoding', function () {

  describe('Uint8Array', function () {
    it(`should be defined`, function () {
      expect(typeof Uint8Array).to.not.equal('undefined');
    });
  });

  const s = 'xyzABCDE';

  describe(`The b64 string "${s}"`, function () {
    describe('decoded as a Uint8Array', function () {
      let e = '';
      try {
        const array = Object.values(b64ToUint8Array(s));
        const expected_array = [199, 44, 192, 4, 32, 196];
        it(`should equal ${JSON.stringify(expected_array)}`, function () {
          array.should.have.members(expected_array);
        });
        it('should be a Uint8Array', function () {
          expect(array instanceof Array);
        });
      } catch (err) {
        e = err;
      }
      it('should succeed', function () {
        e.should.not.be.an('error');
      });
    });
  });

  describe(`A b64 encoded publicKey and sig`, function () {
    it(`should be usable by tweetnacl`, function () {
      const publicKey = 'zcsKbTYYKYc31hj/FCAmJlsizz2gOJRk+oOQYgQIpUg=';
      const message = strToUint8Array('message');
      const sig = 'W9tcoxwdXr4er5FxH7LONOYKYSm1+DstAuhMhhuJXpzdlir5vbuIdfTAQDEABoyBqGtwhyKsKkMmsz8aD/wACQ==';
      (() => nacl.sign.detached.verify(message, b64ToUint8Array(sig), b64ToUint8Array(publicKey))).should.not.throw();
    });
  });

});