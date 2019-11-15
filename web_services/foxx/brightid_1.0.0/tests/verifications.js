"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const query = require('@arangodb').query;

const contextsColl = arango._collection('contexts');

const chai = require('chai');
const should = chai.should();

let testIdsColl;

describe('verifications', function () {
  before(function(){
    testIdsColl = arango._create('testIds');
    contextsColl.truncate();
    query`
      INSERT {
        _key: "testContext",
        collection: "testIds"
      } IN ${contextsColl}
    `;
  });
  after(function(){
    arango._drop(testIdsColl);
    contextsColl.truncate();
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
  describe('latestVerificationByUser()', function(){
    it('should return the latest timestamp for a user', function(){
      db.latestVerificationByUser(testIdsColl,'2').should.equal(25);
    });
  });
  describe('latestVerificationById()', function(){
    it('should return the latest timestamp for an id', function(){
      db.latestVerificationById('testContext','stillUsed').should.equal(25);
    });
    it("should not return an id that isn't verified", function(){
      should.not.exist(db.latestVerificationById('testContext','notVerified'));
    });
  });
});



