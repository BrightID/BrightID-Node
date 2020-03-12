"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const { hash } = require('../encoding');

const connectionsColl = arango._collection('connections');
const removedColl = arango._collection('removed');
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
    db.createUser('e');
    db.createUser('f');
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
     db.createGroup('b', 'c', 'd', Date.now());
     newGroupsColl.count().should.equal(1);
     groupId = hash(['b', 'c', 'd'].sort().join(','));
     newGroupsColl.any()._key.should.equal(groupId);
  });
  it('should be able to delete a group', function() {
    db.deleteGroup(groupId, 'b', Date.now());
    newGroupsColl.count().should.equal(0);
  })
  it('should be able to create the group again', function () {
    db.createGroup('b', 'c', 'd', Date.now());
    newGroupsColl.count().should.equal(1);
    groupId = hash(['b', 'c', 'd'].sort().join(','));
 	newGroupsColl.any()._key.should.equal(groupId);
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
    });
  });
  describe('flagging', function() {
    before(function() {
      db.addConnection('a', 'd', 0);
      db.addConnection('a', 'e', 0);
      db.addConnection('a', 'f', 0);
      db.addConnection('b', 'd', 0);
      db.addConnection('b', 'e', 0);
      db.addConnection('b', 'f', 0);
      db.addConnection('c', 'd', 0);
      db.addConnection('c', 'e', 0);
      db.addConnection('c', 'f', 0);
      db.addMembership(groupId, 'a', Date.now());
      db.addMembership(groupId, 'e', Date.now());
      db.addMembership(groupId, 'f', Date.now());

    });

    it('should not be able to flag someone without having connection', function(){
      (() => {
        db.removeConnection('e', 'f', 'duplicate', 0);
      }).should.throw('no connection found');
    });

    it('should be able to flag a connection', function(){
      db.removeConnection('b', 'a', 'duplicate', 0);
      usersColl.document('a').flaggers.should.deep.equal({'b': 'duplicate'});
      db.userConnections('b').should.not.include('a');
    });

    it('user should be removed from a group after being flagged by 2 members', function(){      
      db.removeConnection('c', 'a', 'duplicate', 0);
      usersColl.document('a').flaggers.should.deep.equal({'b': 'duplicate', 'c': 'duplicate'});
      db.userConnections('a').should.not.include('c');
      usersInGroupsColl.byExample({'_from': 'users/a'}).count().should.equal(0);
      usersInGroupsColl.byExample({'_from': 'users/b'}).count().should.equal(1);
      usersInGroupsColl.byExample({'_from': 'users/c'}).count().should.equal(1);
    });

    it('flagged user should not be able to join a group that is flagged by 2 members', function(){
      (() => {
        db.addMembership(groupId, 'a', Date.now());
      }).should.throw('user is flagged by two or more members of the group');
    });

    it('should be able to remove a flag by making connection again', function(){
      db.addConnection('a', 'b', 0);
      usersColl.document('a').flaggers.should.deep.equal({'c': 'duplicate'});
    });

  });
});