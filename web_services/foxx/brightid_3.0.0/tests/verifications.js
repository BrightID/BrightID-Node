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

let contextIdsColl;
const usersColl = arango._collection('users');
const contextsColl = arango._collection('contexts');
const sponsorshipsColl = arango._collection('sponsorships');

const chai = require('chai');
const should = chai.should();

const { baseUrl } = module.context;

describe('verifications', function () {
  before(function(){
    contextIdsColl = arango._create('testIds');
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
        _key: "2",
        verifications: ["testVerification"]
      } IN ${usersColl}
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
    arango._drop(contextIdsColl);
    usersColl.truncate();
    contextsColl.truncate();
    sponsorshipsColl.truncate();
  });
  it('should be able to map only a single contextId to each user', function() {
    db.linkContextId('1', 'testContext', 'used', 5);
    db.linkContextId('2', 'testContext', 'old', 15);
    db.linkContextId('2', 'testContext', 'new', 25);
  });
  context('linkContextId()', function(){
    it('should throw "contextId is duplicate" for not duplicate contextId', function(){
      (() => {
        db.linkContextId('3', 'testContext', 'used', 30);
      }).should.throw('contextId is duplicate');
    });
    it('should return add link if contextId and timestamp are OK', function(){
      db.linkContextId('3', 'testContext', 'testContextId', 30);
      db.getUserByContextId(contextIdsColl, 'testContextId').should.equal('3');
    });
  });
  it('should be able to sponsor a user if context has unused sponsorships and user did not sponsor before', function() {
    db.sponsor('2', 'testContext');
  });
  context('sponsor()', function(){
    it('should throw "context does not have unused sponsorships" if context has no unused sponsorship', function(){
      (() => {
        db.sponsor('4', 'testContext');
      }).should.throw('context does not have unused sponsorships');
    });
  });
});
