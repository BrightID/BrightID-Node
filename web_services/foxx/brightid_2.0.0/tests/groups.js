"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const newGroupsColl = arango._collection('newGroups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersInNewGroupsColl = arango._collection('usersInNewGroups');
const usersColl = arango._collection('users');

const chai = require('chai');
const should = chai.should();
const expect = chai.expect;


describe('groups', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    db.createUser('a');
    db.createUser('b');
    db.createUser('c');
    db.createUser('d');
    db.addConnection('b', 'c', 0);
    db.addConnection('b', 'd', 0);
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
  });
  let groupId;
  it('should be able to create a group', function () {
     groupId = db.createGroup('b', 'c', 'd', Date.now())._id.replace(/^newGroups\//, '');
     newGroupsColl.count().should.equal(1);
  });
  it('should be able to delete a group', function() {
    db.deleteGroup(groupId, 'b', Date.now());
    newGroupsColl.count().should.equal(0);
  })
  it('should be able to create the group again', function () {
    groupId = db.createGroup('b', 'c', 'd', Date.now())._id.replace(/^newGroups\//, '');
    newGroupsColl.count().should.equal(1);
  });
  it('the two co-founders should be able to join the group', function (){
    db.addMembership(groupId, 'c', Date.now());
    db.addMembership(groupId, 'd', Date.now());
  });
  it('the group should be upgraded from a new group to a normal group', function (){
    groupsColl.count().should.equal(1);
  });

  describe('a user connected to all three members of a group', function() {
    before(function() {
      db.addConnection('a', 'b', 0);
      db.addConnection('a', 'c', 0);
      db.addConnection('a', 'd', 0);
    });

    it('should have three connections', function(){
      db.userConnections('a').length.should.equal(3);
    });
    it('should be eligible to join the group', function (){
      const eligibleGroups = db.userEligibleGroups('a', db.userConnectionsRaw('a'));
      eligibleGroups.should.not.be.empty;
      eligibleGroups[0].id.should.equal(groupId);
    });
    it('should be able to join the group', function (){
      db.addMembership(groupId, 'a', Date.now());
      usersInGroupsColl.count().should.equal(4);
    });
    it('should be able to leave the group', function (){
      db.deleteMembership(groupId, 'a', Date.now());
      usersInGroupsColl.count().should.equal(3);
    })
  });

});