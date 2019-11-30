"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const query = require('@arangodb').query;
const request = require("@arangodb/request");
const { strToUint8Array, uInt8ArrayToB64, b64ToUrlSafeB64 } = require('../encoding');
const nacl = require('tweetnacl');
nacl.setPRNG(function(x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});

let testIdsColl;
const usersColl = arango._collection('users');
const contextsColl = arango._collection('contexts');
const sponsorshipsColl = arango._collection('sponsorships');

const chai = require('chai');
const should = chai.should();

const { baseUrl } = module.context;

let { publicKey: contextPublicKey, secretKey: contextSecretKey } = nacl.sign.keyPair();
let { publicKey: userPublicKey, secretKey: userSecretKey } = nacl.sign.keyPair();
let { publicKey: anotherUserPublicKey, secretKey: anotherUserSecretKey } = nacl.sign.keyPair();

contextPublicKey = uInt8ArrayToB64(Object.values(contextPublicKey));
userPublicKey = uInt8ArrayToB64(Object.values(userPublicKey));
anotherUserPublicKey = uInt8ArrayToB64(Object.values(anotherUserPublicKey));

    
describe('verifications', function () {
  before(function(){
    testIdsColl = arango._create('testIds');
    usersColl.truncate();
    contextsColl.truncate();
    sponsorshipsColl.truncate();    
    query`
      INSERT {
        _key: "testContext",
        collection: "testIds",
        verification: "testVerification",
        totalSponsorships: 1,
        signingKey: ${contextPublicKey}
      } IN ${contextsColl}
    `;
    query`
      INSERT {
        _key: ${b64ToUrlSafeB64(userPublicKey)},
        verifications: ["testVerification"]
      } IN ${usersColl}
    `;
    query`
      INSERT {
        _key: ${b64ToUrlSafeB64(anotherUserPublicKey)},
        verifications: ["testVerification"]
      } IN ${usersColl}
    `;
  });
  after(function(){
    arango._drop(testIdsColl);
    usersColl.truncate();
    contextsColl.truncate();
    sponsorshipsColl.truncate();
  });
  it('should be able to map several accounts to users', function() {
    db.addId(testIdsColl, 'old', '1', 1);
    db.addId(testIdsColl, 'stillUsed', '1', 5);
    db.addId(testIdsColl, 'unused', '1', 10);

    db.addId(testIdsColl, 'unused', '2', 15);
    db.addId(testIdsColl, 'stillUsed', '2', 25);
  });
  it('should include an old, unused id under revocable ids', function() {
    db.revocableIds(testIdsColl, 'new', '1').should.include('old');
  });
  it('should include an id no longer used by a different user under revocable ids', function(){
    db.revocableIds(testIdsColl, 'new', '1').should.include('unused');
  });
  it('should not include an id still used by a different user under revocable ids', function(){
    db.revocableIds(testIdsColl, 'new', '1').should.not.include('stillUsed');
  });
  context('latestVerificationByUser()', function(){
    it('should return the latest timestamp for a user', function(){
      db.latestVerificationByUser(testIdsColl,'2').should.equal(25);
    });
  });
  context('latestVerificationById()', function(){
    it('should return the latest timestamp for an id', function(){
      db.latestVerificationById('testContext','stillUsed').should.equal(25);
    });
    it("should not return an id that isn't verified", function(){
      should.not.exist(db.latestVerificationById('testContext','notVerified'));
    });
  });
  context('fetchVerification()', function(){
    let options, sig, anotherSig, sponsorshipSig;
    before(function(){
      const timestamp = Date.now();
      const message = 'testContext' + ',' + 'testUserId' + ',' + timestamp;
      sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), userSecretKey))
      );
      anotherSig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), anotherUserSecretKey))
      );
      sponsorshipSig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), contextSecretKey))
      );
      options = {
        body: {
          context: 'testContext',
          id: 'testUserId',
          publicKey: userPublicKey,
          timestamp,
          sig
        },
        json: true
      }
    });
    it('should throw "user is not sponsored" for not sponsored users', function(){
      const resp = request.post(`${baseUrl}/fetchVerification`, options);
      resp.statusCode.should.equal(403);
      resp.json.errorMessage.should.equal('user is not sponsored');
    });
    it('should return verification if user provide sponsorshipSig', function(){
      options.body.sponsorshipSig = sponsorshipSig;
      const resp = request.post(`${baseUrl}/fetchVerification`, options);
      resp.statusCode.should.equal(200);
      resp.json.should.have.key('data');
    });
    it('should throw "context does not have unused sponsorships" if context has no unused sponsorship', function(){
      options.body.publicKey = anotherUserPublicKey;
      options.body.sig = anotherSig;
      const resp = request.post(`${baseUrl}/fetchVerification`, options);
      resp.statusCode.should.equal(403);
      resp.json.errorMessage.should.equal('context does not have unused sponsorships');
    });
    it('should return verification if user is sponsored before', function(){
      delete options.body.sponsorshipSig;
      options.body.publicKey = userPublicKey;
      options.body.sig = sig;
      const resp = request.post(`${baseUrl}/fetchVerification`, options);
      resp.statusCode.should.equal(200);
      resp.json.should.have.key('data');
    });
  });
});