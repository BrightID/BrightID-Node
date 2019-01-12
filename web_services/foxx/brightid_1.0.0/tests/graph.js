"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const connectionsColl = arango._collection('connections');
const removedColl = arango._collection('removed');
const groupsColl = arango._collection('groups');
const newGroupsColl = arango._collection('newGroups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersInNewGroupsColl = arango._collection('usersInNewGroups');
const usersColl = arango._collection('users');

describe('db graph', function () {
  before(function(){
    connectionsColl.truncate();
    removedColl.truncate();
  });
  after(function(){
    connectionsColl.truncate();
    removedColl.truncate();
  });
  it('should be able to create a connection', function () {
    db.addConnection('a', 'b', Date.now());
  });
  it("should be able to remove a connection", function () {
    db.removeConnection('b', 'a', Date.now());
  });
  it("should be able to re-add a connection", function () {
    db.addConnection('b', 'a', Date.now());
  });
  it("should be able to re-remove a connection", function () {
    db.removeConnection('a', 'b', Date.now());
  });
});



