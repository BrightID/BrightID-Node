"use strict";

const operations = require('../operations.js');
const arango = require('@arangodb').db;

const usersColl = arango._collection('users');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const chai = require('chai');
const should = chai.should();

describe('', function () {
  before(function(){
    usersColl.insert({'_key': 'a', 'verifications': ['BrightID']});
    usersColl.insert({'_key': 'b'});
    usersColl.insert({'_key': 'c'});
  });
  after(function(){
    usersColl.truncate();
  });
  it('should get error after limit', function() {
    operations.checkLimits({ name: 'Add Group', id1: 'a' }, 100, 2);
    operations.checkLimits({ name: 'Remove Group', id: 'a' }, 100, 2);
    (() => {
      operations.checkLimits({ name: 'Add Membership', id: 'a' }, 100, 2);
    }).should.throw('Too Many Requests');
  });
  it('limit should be removed after time window passed', function() {
    // for some reason setTimeout is not working
    const now = Date.now();
    while (Date.now() - now < 100);
    operations.checkLimits({ name: 'Remove Group', id: 'a' }, 100, 2);
  });
  it('unverified users should have shared limit', function() {
    operations.checkLimits({ name: 'Add Group', id1: 'b' }, 100, 2);
    operations.checkLimits({ name: 'Add Group', id1: 'c' }, 100, 2);
    (() => {
      operations.checkLimits({ name: 'Add Membership', id: 'b' }, 100, 2);
    }).should.throw('Too Many Requests');
  });
});
