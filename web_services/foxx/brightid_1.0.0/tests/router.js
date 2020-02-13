"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const query = require('@arangodb').query;
const request = require("@arangodb/request");
const nacl = require('tweetnacl');
nacl.setPRNG(function(x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});
const { b64ToUrlSafeB64, uInt8ArrayToB64, strToUint8Array, b64ToUint8Array } = require('../encoding');
const safe = b64ToUrlSafeB64;

const { baseUrl } = module.context;

const contextsColl = arango._collection('contexts');
const usersColl = arango._collection('users');

const chai = require('chai');
const should = chai.should();

let testIdsColl;

const u = nacl.sign.keyPair();
u.b64PublicKey = uInt8ArrayToB64(Object.values(u.publicKey));

describe('fetchVerification', function () {
  before(function(){
    testIdsColl = arango._create('ethereum');
    contextsColl.truncate();
    usersColl.truncate();
    query`
      INSERT {
        _key: "ethereum",
        collection: "ethereum",
        verification: "ethereum"
      } IN ${contextsColl}
    `;
    query`
      INSERT {
        _key: ${safe(u.b64PublicKey)},
        verifications: ["ethereum"]
      } IN ${usersColl}
    `;
  });
  after(function(){
    arango._drop(testIdsColl);
    contextsColl.truncate();
    usersColl.truncate();
  });

  it('should be able to fetchVerification', function () {
    const timestamp = Date.now();
    const context = 'ethereum';
    const id = 'testid';
    const message = context + ',' + id + ',' + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
    );
    const resp = request.post(`${baseUrl}/fetchVerification`, {
      body: { publicKey: u.b64PublicKey, context, sig, id, timestamp, signed: 'eth' },
      json: true
    });
    resp.status.should.equal(200);
    console.log(resp.json.data);
    resp.json.data.unique.should.equal(true);

    testIdsColl.byExample({'user': safe(u.b64PublicKey), account: id}).toArray().length.should.equal(1);
  });
});
