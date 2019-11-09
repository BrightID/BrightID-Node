"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const newGroupsColl = arango._collection('newGroups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersInNewGroupsColl = arango._collection('usersInNewGroups');
const usersColl = arango._collection('users');
const recoveryColl = arango._collection('recovery');

const chai = require('chai');
const should = chai.should();

describe('recovery', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    recoveryColl.truncate();
    db.createUser('a');
    db.createUser('b');
    db.createUser('c');
    db.addConnection('a', 'b', 0);
    db.addConnection('a', 'c', 0);
    db.addConnection('b', 'c', 0);
    let groupId = db.createGroup('a', 'b', 'c', Date.now())._id.replace(/^newGroups\//, '');
    db.addMembership(groupId, 'b', Date.now());
    db.addMembership(groupId, 'c', Date.now());
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    recoveryColl.truncate();
  });
  it('should be able to set trusted connections', function () {
    db.setTrustedConnections('b,c', 'a');
    db.loadUser('a').trustedConnections.length.should.equal(2);
  });
  it('not trusted connection, should not be able to call recover', function () {
    db.recover('d', 'a', 'e', Date.now()).should.equal('d is not a trusted connection');
  });
  it('trusted connection, should be able to call recover', function () {
    db.recover('b', 'a', 'e', Date.now()).should.equal('success');
    recoveryColl.all().toArray().length.should.equal(1);
    let r = recoveryColl.all().toArray()[0];
    r.helpers.should.deep.equal(['b']);
    r.state.should.equal('pending');
    db.userCurrentGroups('a').length.should.equal(1);
    db.userConnections('a').length.should.equal(2);
    db.userCurrentGroups('e').length.should.equal(0);
    db.userConnections('e').length.should.equal(0);
  });
  it('multiple calling of recover by the same trusted connection should has no result', function () {
    db.recover('b', 'a', 'e', Date.now()).should.equal('b recovered a before');
    recoveryColl.all().toArray().length.should.equal(1);
    let r = recoveryColl.all().toArray()[0];
    r.helpers.should.deep.equal(['b']);
    r.state.should.equal('pending');
    db.userCurrentGroups('e').length.should.equal(0);
    db.userConnections('e').length.should.equal(0);
  });
  it('calling recover by second trusted connection should recover the account', function () {
    db.recover('c', 'a', 'e', Date.now()).should.equal('success');
    recoveryColl.all().toArray().length.should.equal(1);
    let r = recoveryColl.all().toArray()[0];
    r.helpers.length.should.equal(2);
    r.helpers.should.deep.equal(['b', 'c']);
    r.state.should.equal('completed');
    db.userCurrentGroups('e').length.should.equal(1);
    db.userCurrentGroups('e').founders.should.include('users/e');
    db.userCurrentGroups('e').founders.should.not.include('users/a');
    db.userConnections('e').length.should.equal(2);
    db.userCurrentGroups('a').length.should.equal(0);
    db.userConnections('a').length.should.equal(0);
  });
  it('trusted connections should be able to recover the account again', function () {
    db.recover('b', 'e', 'f', Date.now()).should.equal('success');
    db.recover('c', 'e', 'f', Date.now()).should.equal('success');
    recoveryColl.all().toArray().length.should.equal(2);
    let r = recoveryColl.all().toArray()[1];
    r.helpers.length.should.equal(2);
    r.helpers.should.deep.equal(['b', 'c']);
    r.state.should.equal('completed');
    db.userCurrentGroups('f').length.should.equal(1);
    db.userConnections('f').length.should.equal(2);
    db.userCurrentGroups('e').length.should.equal(0);
    db.userConnections('e').length.should.equal(0);
  });
  it('trusted connections should be able to recover the account again using its old key', function () {
    db.recover('b', 'a', 'g', Date.now()).should.equal('success');
    db.recover('c', 'a', 'g', Date.now()).should.equal('success');
    recoveryColl.all().toArray().length.should.equal(3);
    let r = recoveryColl.all().toArray()[1];
    r.helpers.length.should.equal(2);
    r.helpers.should.deep.equal(['b', 'c']);
    r.state.should.equal('completed');
    db.userCurrentGroups('g').length.should.equal(1);
    db.userConnections('g').length.should.equal(2);
    db.userCurrentGroups('f').length.should.equal(0);
    db.userConnections('f').length.should.equal(0);
  });
});
