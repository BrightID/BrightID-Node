"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;

const chai = require('chai');
const should = chai.should();

let testIdsColl;

describe('verifications', function () {
  before(function(){
    testIdsColl = arango._create('testIds');
  });
  after(function(){
    arango._drop(testIdsColl);
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
  it('should not include and id still used by a different user under revocable ids', function(){
    db.revocableIds(testIdsColl, 'new', '1').should.not.include('stillUsed');
  });
});



