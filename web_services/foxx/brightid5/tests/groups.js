"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const { hash } = require('../encoding');

const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersColl = arango._collection('users');
const invitationsColl = arango._collection('invitations');

const chai = require('chai');
const should = chai.should();
const expect = chai.expect;
const url = 'http://url.com/dummy';

describe('groups', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    invitationsColl.truncate();
    db.createUser('a');
    db.createUser('b');
    db.createUser('c');
    db.createUser('d');
    db.createUser('e');
    db.createUser('f');
    db.addConnection('b', 'c', 0);
    db.addConnection('b', 'd', 0);
    db.addConnection('a', 'b', 0);
    db.addConnection('a', 'c', 0);
    db.addConnection('a', 'd', 0);
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    invitationsColl.truncate();
  });
  it('should be able to create a group', function () {
    db.createGroup('g1', 'b', 'c', 'data', 'd', 'data', url, 'general', Date.now());
    groupsColl.count().should.equal(1);
    const group = groupsColl.any()
    group._key.should.equal('g1');
    group.isNew.should.equal(true);
  });
  it('should be able to delete a group', function() {
    db.deleteGroup('g1', 'b', Date.now());
    groupsColl.count().should.equal(0);
  })
  it('should be able to create the group again', function () {
    db.createGroup('g2', 'b', 'c', 'data', 'd', 'data', url, 'general', Date.now());
    groupsColl.count().should.equal(1);
    groupsColl.any()._key.should.equal('g2');
  });
  it('the two co-founders should be able to join the group', function (){
    db.addMembership('g2', 'c', Date.now());
    db.addMembership('g2', 'd', Date.now());
  });
  it('the group should be upgraded from a new group to a normal group', function (){
    groupsColl.count().should.equal(1);
    groupsColl.any().isNew.should.equal(false);
  });

  describe('a user connected to all three members of a group', function() {
    it('should have three connections', function(){
      db.userConnections('a').length.should.equal(3);
    });
    it('should be eligible to join the group', function (){
      const eligibleGroups = usersColl.document('a').eligible_groups;
      eligibleGroups.should.not.be.empty;
      eligibleGroups[0].should.equal('g2');
    });
    it('should not be able to join the group without invitation', function (){
      (() => {
        db.addMembership('g2', 'a', Date.now());
      }).should.throw('not invited to join this group');
    });
    it('should be able to join the group after invitation', function (){
      db.invite('b', 'a', 'g2', 'data', Date.now());
      db.addMembership('g2', 'a', Date.now());
      usersInGroupsColl.count().should.equal(4);
    });
    it('should be able to leave the group', function (){
      db.deleteMembership('g2', 'a', Date.now());
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
      db.invite('b', 'a', 'g2', 'data', Date.now());
      db.addMembership('g2', 'a', Date.now());
      db.invite('b', 'e', 'g2', 'data', Date.now());
      db.addMembership('g2', 'e', Date.now());
      db.invite('b', 'f', 'g2', 'data', Date.now());
      db.addMembership('g2', 'f', Date.now());
    });

    it('should be able to flag a connection', function(){
      db.removeConnection('b', 'a', 'duplicate', 0);
      db.getFlaggers('a').should.deep.equal({'b': 'duplicate'});
    });

    it('should be able to remove a flag', function(){
      db.connect('b', 'a', 'just met', null, 0);
      db.getFlaggers('a').should.deep.equal({});
    });
  });

  describe('inviting', function() {
    before(function() {
      db.createUser('g');
      db.addConnection('a', 'b', 0);
      db.addConnection('a', 'c', 0);
      db.addConnection('a', 'd', 0);
      db.addConnection('b', 'd', 0);
      db.addConnection('c', 'd', 0);
      db.createGroup('g3', 'a', 'b', 'data', 'c', 'data', url, 'general', Date.now());
      db.addMembership('g3', 'b', Date.now());
      db.addMembership('g3', 'c', Date.now());
    });
    it('no one should be able to join an invite only group without invitation', function (){
      (() => {
        db.addMembership('g3', 'd', Date.now());
      }).should.throw('not invited to join this group');
    });
    it('admins should not be able to invite non-eligible users to the group', function (){
      (() => {
        db.invite('a', 'g', 'g3', 'data', Date.now());
      }).should.throw('invitee is not eligible to join this group');
    });
    it('admins should be able to invite eligible users to the group', function (){
      db.invite('b', 'd', 'g3', 'data', Date.now());
      db.userInvitedGroups('d').map(group => group.id).should.deep.equal(['g3']);
    });
    it('invited user should be able to join the group', function (){
      db.addMembership('g3', 'd', Date.now());
      db.groupMembers('g3').should.include('d');
      db.userInvitedGroups('d').length.should.equal(0);
    });
    it('non-admins should not be able to invite others to the group', function (){
      (() => {
        db.invite('d', 'e', 'g3', 'data', Date.now());
      }).should.throw('inviter is not admin of group');
    });
  });

  describe('dismissing', function() {
    before(function() {
      db.invite('b', 'd', 'g3', 'data', Date.now());
      db.invite('b', 'e', 'g3', 'data',  Date.now());
      db.addMembership('g3', 'd', Date.now());
      db.addMembership('g3', 'e', Date.now());
    });
    it('non-admins should not be able to dismiss others from the group', function (){
      (() => {
        db.dismiss('d', 'e', 'g3', Date.now());
      }).should.throw('dismisser is not admin of group');
    });
    it('admins should be able to dismiss others from the group', function (){
      db.dismiss('b', 'd', 'g3', Date.now());
      db.groupMembers('g3').should.not.include('d');
    });
  });

  describe('adding new admins', function() {
    before(function() {
      db.invite('b', 'd', 'g3', 'data', Date.now());
      db.addMembership('g3', 'd', Date.now());
    });
    it('non-admins should not be able to add new admins', function (){
      (() => {
        db.addAdmin('e', 'd', 'g3', Date.now());
      }).should.throw('only admins can add new admins');
    });
    it('admins should be able to add new admins', function (){
      db.addAdmin('b', 'd', 'g3', Date.now());
      groupsColl.document('g3').admins.should.include('d');
    });
    it('new admins should be able to dismiss others from the group', function (){
      db.dismiss('d', 'e', 'g3', Date.now());
      db.groupMembers('g3').should.not.include('e');
    });
    it('admins should be removed from admins list when they leave the group', function (){
      groupsColl.document('g3').admins.should.include('d');
      db.deleteMembership('g3', 'd', Date.now());
      groupsColl.document('g3').admins.should.not.include('d');
    });
  });

  describe('primary groups', function() {
    before(function() {
      groupsColl.truncate();
      groupsColl.truncate();
      usersInGroupsColl.truncate();
      db.createGroup('g4', 'a', 'b', 'data', 'c', 'data', url, 'primary', Date.now());
      db.addMembership('g4', 'b', Date.now());
      db.addMembership('g4', 'c', Date.now());
    });
    it('users that have primary groups should not be able to create new primary groups', function (){
      (() => {
        db.createGroup('g5', 'a', 'd', 'data', 'e', 'data', url, 'primary', Date.now());
      }).should.throw('some of founders already have primary groups');
    });
    it('users with no primary group should be able to join a primary group', function (){
      db.invite('a', 'd', 'g4', 'data', Date.now());
      db.addMembership('g4', 'd', Date.now());
      db.userGroups('d').map(group => group.id).should.deep.equal(['g4']);
    });
    it('users that have primary groups should not be able to invited to other primary groups', function (){
      db.addConnection('e', 'f', Date.now());
      db.addConnection('e', 'g', Date.now());
      db.createGroup('g6', 'e', 'f', 'data', 'g', 'data', url, 'primary', Date.now());
      db.addMembership('g6', 'f', Date.now());
      db.addMembership('g6', 'g', Date.now());
      (() => {
        db.invite('a', 'e', 'g4', 'data', Date.now());
      }).should.throw('user already has a primary group');

    });
  });

});