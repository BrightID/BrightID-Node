"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const usersColl = arango._collection('users');
const connectionsColl = arango._collection('connections');
const connectionsHistoryColl = arango._collection('connectionsHistory');

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
  it('should be able to use "connect" to upgrade confidence level to "already known"', function() {
    db.connect({id1: 'b', id2: 'a', level: 'already known'});
    connectionsColl.firstExample({
      '_from': 'users/b', '_to': 'users/a'
    }).level.should.equal('already known');
  });
  it('should be able to use "removeConnection" to report a connection that already knows the reporter', function() {
    db.removeConnection('a', 'b', 'duplicate', 0);
    const conn = connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    });
    conn.level.should.equal('reported');
    conn.reportReason.should.equal('duplicate');
  });
  it('should be able to use "connect" to reset confidence level to "just met"', function() {
    db.connect({id1: 'a', id2: 'b', level: 'just met'});
    const conn1 = connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    });
    conn1.level.should.equal('just met');
    (conn1.reportReason === null).should.equal(true);
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
    }).level.should.equal('already known');
  });
  it('should be able to use "connect" to set different confidence levels', function() {
    db.connect({id1: 'a', id2: 'b', level: 'reported', reportReason: 'duplicate'});
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('reported');
    db.connect({id1: 'a', id2: 'b', level: 'just met'});
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('just met');
    db.connect({id1: 'a', id2: 'b', level: 'recovery'});
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/b'
    }).level.should.equal('recovery');
    db.connect({id1: 'a', id2: 'c', level: 'just met'});
    connectionsColl.firstExample({
      '_from': 'users/a', '_to': 'users/c'
    }).level.should.equal('just met');
  });

  it('should be able to use "setSigningKey" to reset "signingKey" with "recovery" connections', function() {
    db.connect({id1: 'a', id2: 'c', level: 'recovery'});
    db.setSigningKey('newSigningKey', 'a', ['b', 'c'], 0);
    usersColl.document('a').signingKey.should.equal('newSigningKey');
  });

  it('should be able to get "userConnections"', function() {
    db.connect({id1: 'c', id2: 'a', level: 'reported', reportReason: 'duplicate'});
    const conns = db.userConnections('b');
    conns.length.should.equal(1);
    const a = conns[0];
    a.id.should.equal('a');
    a.level.should.equal('already known');
  });

  it('should be able to report someone as replaced', function() {
    db.connect({id1: 'c', id2: 'a', level: 'reported', reportReason: 'replaced', replacedWith: 'b'});
    const conn = connectionsColl.firstExample({
      '_from': 'users/c', '_to': 'users/a'
    });
    conn.level.should.equal('reported');
    conn.reportReason.should.equal('replaced');
    conn.replacedWith.should.equal('b');
  });

});

describe('trusted connections', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
  });
  it('users should be able add or remove trusted connections', function() {
    db.connect({id1: 'a', id2: 'b', level: 'recovery', 'timestamp': 1});
    db.connect({id1: 'a', id2: 'c', level: 'recovery', 'timestamp': 1});
    db.connect({id1: 'a', id2: 'd', level: 'recovery', 'timestamp': 1});
    db.connect({id1: 'a', id2: 'e', level: 'recovery', 'timestamp': 2});
    db.connect({id1: 'a', id2: 'f', level: 'recovery', 'timestamp': 3});
    db.connect({id1: 'a', id2: 'b', level: 'reported', reportReason: 'duplicate', 'timestamp': 4});

    const recoveryConnections = db.getRecoveryConnections('a');
    recoveryConnections.should.deep.equal(['c', 'd', 'e', 'f']);
  });

  it('remove trusted connection should take one week to take effect to protect against takeover', function() {
    db.connect({id1: 'a', id2: 'c', level: 'reported', reportReason: 'duplicate', 'timestamp': Date.now()});

    const recoveryConnections = db.getRecoveryConnections('a');
    recoveryConnections.should.deep.equal(['c', 'd', 'e', 'f']);
  });

  it("don't allow a trusted connection to be used for recovery if it is too new", function() {
    db.connect({id1: 'a', id2: 'g', level: 'recovery', 'timestamp': Date.now()});

    const recoveryConnections = db.getRecoveryConnections('a');
    recoveryConnections.should.deep.equal(['c', 'd', 'e', 'f']);
  });

  it("ignore cooling period from recovery connections set in the first day", function() {
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
    const firstConnTime = Date.now() - 4*24*60*60*1000;
    db.connect({id1: 'a', id2: 'b', level: 'recovery', 'timestamp': firstConnTime});
    db.connect({id1: 'a', id2: 'c', level: 'recovery', 'timestamp': firstConnTime + (5*60*60*1000)});
    db.connect({id1: 'a', id2: 'd', level: 'recovery', 'timestamp': firstConnTime + (22*60*60*1000)});
    db.connect({id1: 'a', id2: 'e', level: 'recovery', 'timestamp': firstConnTime + (30*60*60*1000)});
    const recoveryConnections = db.getRecoveryConnections('a');
    recoveryConnections.should.deep.equal(['b', 'c', 'd']);
  });

});
