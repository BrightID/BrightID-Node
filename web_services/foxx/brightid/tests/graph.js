"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersColl = arango._collection('users');

const chai = require('chai');
const should = chai.should();

describe('db graph', function () {
  before(function(){
    connectionsColl.truncate();
    usersColl.truncate();
    db.createUser('a');
    db.createUser('b');
  });
  after(function(){
    connectionsColl.truncate();
    usersColl.truncate();
  });
  it('should be able to retrieve a score for a user', function() {
    db.userScore('a').should.equal(0);
  });
  it('should be able to create a connection', function () {
    db.connect({id1: 'a', id2: 'b', level: 'already known'});
  });
  it("should be able to remove a connection", function () {
    db.removeConnection('b', 'a', 'duplicate', Date.now());
  });
  it("should be able to re-add a connection", function () {
    db.addConnection('b', 'a', Date.now());
  });
});



