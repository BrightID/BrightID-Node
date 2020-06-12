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
        _key: "1",
        verifications: []
      } IN ${usersColl}
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
  context('linkContextId()', function() {
    it('should not be able to link contextId to not verified user', function() {
      (() => {
        db.linkContextId('1', 'testContext', 'used', 5);
      }).should.throw('user is not verified for this context');
    });
    it('should throw "contextId is duplicate" for used contextId', function(){
      db.linkContextId('2', 'testContext', 'used', 5);
      (() => {
        db.linkContextId('3', 'testContext', 'used', 10);
      }).should.throw('contextId is duplicate');
    });
    it('should return add link if contextId and timestamp are OK', function(){
      db.linkContextId('3', 'testContext', 'testContextId', 10);
      db.getUserByContextId(contextIdsColl, 'testContextId').should.equal('3');
    });
    it('should not be able to link new contextId before 3 days', function(){
      (() => {
        db.linkContextId('3', 'testContext', 'testContextId2', 15);
      }).should.throw('one contextId can be linked each 3 days');
    });
    it('should be able to link new contextId after 3 days', function(){
      db.linkContextId('3', 'testContext', 'testContextId2', 3*24*3600*1000 + 15);
    });
  });
  context('sponsor()', function() {
    it('should be able to sponsor a user if context has unused sponsorships and user did not sponsor before', function() {
      db.sponsor('2', 'testContext');
    });
    it('should throw "context does not have unused sponsorships" if context has no unused sponsorship', function(){
      (() => {
        db.sponsor('4', 'testContext');
      }).should.throw('context does not have unused sponsorships');
    });
  });
});
