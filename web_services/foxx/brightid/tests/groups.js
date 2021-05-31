"use strict";

const db = require('../db.js');
const errors = require('../errors.js');
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
    it('admins should be able to invite any users to the group', function (){
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
      }).should.throw(errors.NotAdminError);
    });
  });

  describe('dismissing', function() {
    before(function() {
      db.addConnection('a', 'd', 0);
      db.addConnection('b', 'd', 0);
      db.addConnection('c', 'd', 0);
      db.addConnection('a', 'e', 0);
      db.addConnection('b', 'e', 0);
      db.addConnection('c', 'e', 0);
      db.invite('b', 'd', 'g3', 'data', Date.now());
      db.invite('b', 'e', 'g3', 'data',  Date.now());
      db.addMembership('g3', 'd', Date.now());
      db.addMembership('g3', 'e', Date.now());
    });
    it('non-admins should not be able to dismiss others from the group', function (){
      (() => {
        db.dismiss('d', 'e', 'g3', Date.now());
      }).should.throw(errors.NotAdminError);
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
      }).should.throw(errors.NotAdminError);
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

  describe('family groups', function() {
    before(function() {
      usersColl.truncate();
      connectionsColl.truncate();
      groupsColl.truncate();
      usersInGroupsColl.truncate();
      invitationsColl.truncate();
      db.connect({id1: 'a1', id2: 'b1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'b1', id2: 'a1', level: 'recovery', timestamp: Date.now()});

      db.connect({id1: 'a1', id2: 'c1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'c1', id2: 'a1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'b1', id2: 'c1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'c1', id2: 'b1', level: 'recovery', timestamp: Date.now()});


      db.connect({id1: 'a1', id2: 'd1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'd1', id2: 'a1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'a1', id2: 'e1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'e1', id2: 'a1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'd1', id2: 'e1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'e1', id2: 'd1', level: 'recovery', timestamp: Date.now()});


      db.connect({id1: 'f1', id2: 'a1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'a1', id2: 'f1', level: 'recovery', timestamp: Date.now()});

      db.connect({id1: 'f1', id2: 'b1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'b1', id2: 'f1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'f1', id2: 'd1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'd1', id2: 'f1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'f1', id2: 'e1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'e1', id2: 'f1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'e1', id2: 'b1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'b1', id2: 'e1', level: 'already known', timestamp: Date.now()});

      db.connect({id1: 'e1', id2: 'c1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'c1', id2: 'e1', level: 'already known', timestamp: Date.now()});
    });
    it("should not be able to found a family group when founders don't have required connections", function (){
      (() => {
        db.createGroup('fg1', 'a1', 'b1', 'data', 'd1', 'data', url, 'family', Date.now());
      }).should.throw(errors.IneligibleFamilyGroupFounders);
    });
    it("should be able to found a family group when founders have required connections", function (){
      db.createGroup('fg1', 'a1', 'b1', 'data', 'c1', 'data', url, 'family', (Date.now() - 48*60*60*1000));
      db.addMembership('fg1', 'b1', (Date.now() - 48*60*60*1000));
      db.addMembership('fg1', 'c1', (Date.now() - 48*60*60*1000));
      groupsColl.count().should.equal(1);
    });
    it('head of a family group should not be able to be head of another family groups', function (){
      (() => {
        db.createGroup('fg2', 'a1', 'd1', 'data', 'e1', 'data', url, 'family', Date.now());
      }).should.throw(errors.AlreadyIsFamilyGroupHead);
    });
    it('member of a family group should not be able to be member of another family groups', function (){
      (() => {
        db.createGroup('fg2', 'f1', 'a1', 'data', 'b1', 'data', url, 'family', Date.now());
      }).should.throw(errors.AlreadyIsFamilyGroupMember);
    });
    it("head of a family group should be able be member of another family groups", function (){
      db.createGroup('fg2', 'e1', 'a1', 'data', 'd1', 'data', url, 'family', Date.now());
      db.addMembership('fg2', 'a1', Date.now());
      db.addMembership('fg2', 'd1', Date.now());
      db.userGroups('a1').map(group => group.id).should.deep.equal(['fg1', 'fg2']);
      groupsColl.count().should.equal(2);
    });
    it('users that are member of family groups should not be able to invited to other family groups', function (){
      (() => {
        db.invite('a1', 'd1', 'fg1', 'data', Date.now());
      }).should.throw(errors.AlreadyIsFamilyGroupMember);
    });
    it('users that are not connected to all members of the family groups should not be able to invite to the family group', function (){
      (() => {
        db.invite('a1', 'f1', 'fg1', 'data', Date.now());
      }).should.throw(errors.IneligibleFamilyGroupMember);
    });
    it('eligible users should be able to join a family group', function (){
      db.invite('a1', 'f1', 'fg2', 'data', Date.now());
      db.addMembership('fg2', 'f1', Date.now());
      db.userGroups('f1').map(group => group.id).should.deep.equal(['fg2']);
    });
    it('newly created family groups ineligible  to vouch for', function (){
      (() => {
        db.vouchFamilyGroup('f1', 'fg2', Date.now());
      }).should.throw(errors.IneligibleToVouch);
    });
    it('ineligible users should not be able to vouch family groups', function (){
      (() => {
        db.userEligibleGroupsToVouch('f1').should.not.include('fg1');
        db.vouchFamilyGroup('f1', 'fg1', Date.now());
      }).should.throw(errors.IneligibleToVouchFor);
    });
    it('eligible users should be able to vouch family groups', function (){
      const members = db.groupMembers('fg1');
      db.connect({id1: 'f1', id2: 'c1', level: 'already known', timestamp: Date.now()});
      db.connect({id1: 'c1', id2: 'f1', level: 'already known', timestamp: Date.now()});
      db.userEligibleGroupsToVouch('f1').should.include('fg1');
      db.vouchFamilyGroup('f1', 'fg1', Date.now());
      for (const member of members) {
        const conn = connectionsColl.byExample({ _from: 'users/f1',  _to: `users/${member}`}).next();
        conn.familyVouchConnection.should.equal(true);
      }
    });
  });
});
