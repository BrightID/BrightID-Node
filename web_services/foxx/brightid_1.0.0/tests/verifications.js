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
const sponsorshipsColl = arango._collection('sponsorships');

const chai = require('chai');
const should = chai.should();

let testIdsColl;

const u = nacl.sign.keyPair();
u.b64PublicKey = uInt8ArrayToB64(Object.values(u.publicKey));

const contextPublicKey = 'OAcN2Ag9PA1nLwZrwDdN2qGtOjO3SPU4CUmzP0l43bQ=';
const contextSecretKey = 'rcCiAAwX6gYm/ZPpSPnmvc4gHdKXZTY9dyyHC11GRVs4Bw3YCD08DWcvBmvAN03aoa06M7dI9TgJSbM/SXjdtA==';

const contextName = 'ethereum';
const contextId = 'testid';
    
describe('fetchVerification', function () {
  before(function(){
    testIdsColl = arango._create('ethereum');
    contextsColl.truncate();
    usersColl.truncate();
    sponsorshipsColl.truncate();
    query`
      INSERT {
        _key: ${contextName},
        collection: ${contextName},
        verification: ${contextName},
        totalSponsorships: 1,
        publicKey: ${contextPublicKey}
      } IN ${contextsColl}
    `;
    query`
      INSERT {
        _key: ${safe(u.b64PublicKey)},
        verifications: [${contextName}]
      } IN ${usersColl}
    `;
  });
  after(function(){
    arango._drop(testIdsColl);
    contextsColl.truncate();
    usersColl.truncate();
    sponsorshipsColl.truncate();
  });

  it('should be able to fetchVerification', function () {
    const timestamp = Date.now();
    const message = contextName + ',' + contextId + ',' + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
    );
    const sponsorshipSig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(contextSecretKey)))
    );
    const resp = request.post(`${baseUrl}/fetchVerification`, {
      body: { publicKey: u.b64PublicKey, context: contextName, sig, contextId, timestamp, sponsorshipSig },
      json: true
    });
    resp.status.should.equal(204);
    testIdsColl.byExample({'user': safe(u.b64PublicKey), account: contextId}).toArray().length.should.equal(1);
  });

  it('should be able to get verification', function () {
    const resp = request.get(`${baseUrl}/verifications/${contextName}/${contextId}?signed=eth`, { json: true });
    resp.json.data.unique.should.equal(true);
  });
});
