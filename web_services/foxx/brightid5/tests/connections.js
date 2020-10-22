"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const usersColl = arango._collection('users');
const connectionsColl = arango._collection('connections');

const chai = require('chai');
const should = chai.should();

describe('connections', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
  });
  it('should be able to use "addConnection" to set "just met" as confidence level', function() {
    db.addConnection('a', 'b', 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('just met');
    connectionsColl.firstExample({
      '_from': 'users/b', '_to': 'users/a'
    }).level.should.equal('just met');
  });
  it('should be able to use "removeConnection" to set "spam" as confidence level', function() {
    db.removeConnection('a', 'b', 'duplicate', 0);
    const conn1 = connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    });
    conn1.level.should.equal('spam');
    conn1.flagReason.should.equal('duplicate');
    connectionsColl.firstExample({
      '_from': 'users/b', '_to': 'users/a'
    }).level.should.equal('just met');
  });
  it('should be able to use "connect" to reset confidence level to "just met"', function() {
    db.connect('a', 'b', 'just met', null, 0);
    const conn1 = connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    });
    conn1.level.should.equal('just met');
    (conn1.flagReason === null).should.equal(true);
  });
  it('should be able to use "setRecoveryConnections" to set "recovery" as confidence level', function() {
    db.setRecoveryConnections(['b'], 'a', 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('recovery');
  });
  it('should not reset "recovery" confidence level to "just met" when calling "addConnection"', function() {
    db.addConnection('a', 'b', 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('recovery');
    connectionsColl.firstExample({
      '_from': 'users/b', '_to': 'users/a'
    }).level.should.equal('just met');
  });
  it('should be able to use "connect" to set different as confidence levels', function() {
    db.connect('a', 'b', 'spam', 'duplicate', 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('spam');
    db.connect('a', 'b', 'just met', null, 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('just met');
    db.connect('a', 'b', 'recovery', null, 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('recovery');
    db.connect('a', 'c', 'just met', null, 0);
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/c'
    }).level.should.equal('just met');
  });
  it('should not be able to use "setSigningKey" to reset "signingKey" with not "recovery" connections', function() {
    (() => {
      db.setSigningKey('newSigningKey', 'a', ['b', 'c'], 0);
    }).should.throw('request should be signed by 2 different recovery connections');
  });

  it('should be able to use "setSigningKey" to reset "signingKey" with "recovery" connections', function() {
    db.connect('a', 'c', 'recovery', null, 0);
    db.setSigningKey('newSigningKey', 'a', ['b', 'c'], 0);
    usersColl.document('a').signingKey.should.equal('newSigningKey');
  });

  it('should be able to get "userConnections"', function() {
    db.connect('c', 'a', 'spam', 'duplicate', 0);
    const conns = db.userConnections('b');
    conns.length.should.equal(1);
    const a = conns[0];
    a.id.should.equal('a');
    a.level.should.equal('just met');
    a.flaggers.should.deep.equal({"c": "duplicate"});
    a.trusted.should.deep.equal(["b", "c"]);
    a.signingKey.should.equal('newSigningKey');
    a.createdAt.should.equal(0);
  });

  it('should not get connnections with one side set "spam" level in "userConnections"', function() {
    db.userConnections('a').length.should.equal(1);
    db.userConnections('c').length.should.equal(0);
  });

});
