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
        totalSponsorships: 1
      } IN ${contextsColl}
    `;
    query`
      INSERT {
        _key: "3",
        verifications: ["testVerification"]
      } IN ${usersColl}
    `;
    query`
      INSERT {
        _key: "4",
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
    db.linkAccount(testIdsColl, 'old', '1', 1);
    db.linkAccount(testIdsColl, 'stillUsed', '1', 5);
    db.linkAccount(testIdsColl, 'unused', '1', 10);

    db.linkAccount(testIdsColl, 'unused', '2', 15);
    db.linkAccount(testIdsColl, 'stillUsed', '2', 25);
  });
  it('should include an old, unused account under revocable accounts', function() {
    db.revocableAccounts(testIdsColl, 'new', '1').should.include('old');
  });
  it('should include an id no longer used by a different user under revocable ids', function(){
    db.revocableAccounts(testIdsColl, 'new', '1').should.include('unused');
  });
  it('should not include an id still used by a different user under revocable ids', function(){
    db.revocableAccounts(testIdsColl, 'new', '1').should.not.include('stillUsed');
  });
  context('latestVerificationById()', function(){
    it('should return the latest verification for a BrightId', function(){
      const v = db.latestVerificationById(testIdsColl,'2');
      v.user.should.equal('2');
      v.account.should.equal('stillUsed');
      v.timestamp.should.equal(25);
    });
  });
  context('latestVerificationByAccount()', function(){
    it('should return the latest timestamp for an id', function(){
      const v = db.latestVerificationByAccount(testIdsColl,'stillUsed');
      v.user.should.equal('2');
      v.account.should.equal('stillUsed');
      v.timestamp.should.equal(25);
    });
    it("should not return an id that isn't verified", function(){
      should.not.exist(db.latestVerificationByAccount(testIdsColl,'notVerified'));
    });
  });
  context('verifyAccount()', function(){
    let options, message;
    it('should throw "user is not sponsored" for not sponsored users', function(){
      (() => {
        db.verifyAccount('3', 'testAccount', 'testContext', 30);
      }).should.throw('user is not sponsored');
    });
    it('should return verification if user provide sponsorshipSig', function(){
      db.verifyAccount('3', 'testAccount', 'testContext', 30, 'sig');
      db.latestVerificationById(testIdsColl,'3').timestamp.should.equal(30);
    });
    it('should throw "context does not have unused sponsorships" if context has no unused sponsorship', function(){
      (() => {
        db.verifyAccount('4', 'testAccount', 'testContext', 30, 'sig');
      }).should.throw('context does not have unused sponsorships');
    });
  });
});