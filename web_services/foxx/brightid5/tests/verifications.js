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
const appsColl = arango._collection('apps');
const sponsorshipsColl = arango._collection('sponsorships');

const chai = require('chai');
const should = chai.should();

const { baseUrl } = module.context;

describe('verifications', function () {
  before(function(){
    contextIdsColl = arango._create('testIds');
    usersColl.truncate();
    contextsColl.truncate();
    appsColl.truncate();
    sponsorshipsColl.truncate();
    query`
      INSERT {
        _key: "testContext",
        collection: "testIds",
        verification: "testVerification"
      } IN ${contextsColl}
    `;
    query`
      INSERT {
        _key: "testApp",
        totalSponsorships: 1
      } IN ${appsColl}
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
    appsColl.truncate();
    sponsorshipsColl.truncate();
  });
  context('linkContextId()', function() {
    it('should throw "contextId is duplicate" for used contextId', function(){
      db.linkContextId('2', 'testContext', 'used', 5);
      (() => {
        db.linkContextId('3', 'testContext', 'used', 10);
      }).should.throw('contextId is duplicate');
    });
    it('should allow same user to relink used contextIds', function(){
      db.linkContextId('2', 'testContext', 'second', 11);
      db.linkContextId('2', 'testContext', 'used', 10);
    });
    it('should return add link if contextId and timestamp are OK', function(){
      db.linkContextId('3', 'testContext', 'testContextId', 10);
      db.getUserByContextId(contextIdsColl, 'testContextId').should.equal('3');
    });
    it('should not be able to link more than 3 contextIds in a single day', function(){
      db.linkContextId('3', 'testContext', 'testContextId2', 15);
      db.linkContextId('3', 'testContext', 'testContextId3', 20);
      (() => {
        db.linkContextId('3', 'testContext', 'testContextId4', 25);
      }).should.throw('only three contextIds can be linked every 24 hours');
    });
    it('should be able to link new contextId after 24 hours', function(){
      db.linkContextId('3', 'testContext', 'testContextId4', 24*3600*1000 + 25);
    });
  });
  context('sponsor()', function() {
    it('should be able to sponsor a user if app has unused sponsorships and user is not sponsored before', function() {
      db.sponsor('2', 'testApp', 0);
    });
    it('should throw "app does not have unused sponsorships" if app has no unused sponsorship', function(){
      (() => {
        db.sponsor('4', 'testApp', 0);
      }).should.throw('app does not have unused sponsorships');
    });
  });
});
