"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const usersColl = arango._collection('users');
const connectionsColl = arango._collection('connections');
const connectionsHistoryColl = arango._collection('connectionsHistory');

const chai = require('chai');
const should = chai.should();
const timestamp = Date.now();

describe('connections', function() {
  before(function() {
    usersColl.truncate();
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
  });
  after(function() {
    usersColl.truncate();
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
  });
  it('should be able to "connect" using "just met" as confidence level', function() {
    db.connect({id1: 'a', id2: 'b', level: 'just met', timestamp});
    db.connect({id1: 'b', id2: 'a', level: 'just met', timestamp});
    connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/b'
    }).level.should.equal('just met');
    connectionsColl.firstExample({
      '_from': 'users/b',
      '_to': 'users/a'
    }).level.should.equal('just met');
  });
  it('should be able to use "connect" to upgrade confidence level to "already known"', function() {
    db.connect({id1: 'b', id2: 'a', level: 'already known', timestamp});
    connectionsColl.firstExample({
      '_from': 'users/b',
      '_to': 'users/a'
    }).level.should.equal('already known');
  });
  it('should be able to use "connect" to report a connection that already knows the reporter', function() {
    db.connect({id1: 'a', id2: 'b', level: 'reported', reportReason: "duplicate", timestamp});
    const conn = connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/b'
    });
    conn.level.should.equal('reported');
    conn.reportReason.should.equal('duplicate');
  });
  it('should be able to use "connect" to reset confidence level to "just met"', function() {
    db.connect({id1: 'a', id2: 'b', level: 'just met', timestamp});
    const conn1 = connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/b'
    });
    conn1.level.should.equal('just met');
    (conn1.reportReason === null).should.equal(true);
  });
  it('should be able to use "connect" to set different confidence levels', function() {
    db.connect({id1: 'a', id2: 'b', level: 'reported', reportReason: 'duplicate', timestamp});
    connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/b'
    }).level.should.equal('reported');
    db.connect({id1: 'a', id2: 'b', level: 'just met', timestamp});
    connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/b'
    }).level.should.equal('just met');
    db.connect({id1: 'a', id2: 'b', level: 'recovery', timestamp});
    connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/b'
    }).level.should.equal('recovery');
    db.connect({id1: 'a', id2: 'c', level: 'just met', timestamp});
    connectionsColl.firstExample({
      '_from': 'users/a',
      '_to': 'users/c'
    }).level.should.equal('just met');
  });

  it('should be able to use "setSigningKey" to reset "signingKey" with "recovery" connections', function() {
    db.connect({id1: 'c', id2: 'a', level: 'already known', timestamp});
    db.connect({id1: 'a', id2: 'c', level: 'recovery', timestamp});
    db.setSigningKey('newSigningKey', 'a', ['b', 'c'], timestamp);
    usersColl.document('a').signingKeys.should.deep.equal(['newSigningKey']);
  });

  it('should be able to get "userConnections"', function() {
    db.connect({id1: 'c', id2: 'a', level: 'reported', reportReason: 'duplicate', timestamp: 0 });
    const conns = db.userConnections('b');
    conns.length.should.equal(1);
    const a = conns[0];
    a.id.should.equal('a');
    a.level.should.equal('already known');
  });

  it('should be able to report someone as replaced', function() {
    db.connect({id1: 'c', id2: 'a', level: 'reported', reportReason: 'replaced', replacedWith: 'b', timestamp});
    const conn = connectionsColl.firstExample({
      '_from': 'users/c',
      '_to': 'users/a'
    });
    conn.level.should.equal('reported');
    conn.reportReason.should.equal('replaced');
    conn.replacedWith.should.equal('b');
  });

});

describe('recovery connections', function() {
  before(function() {
    usersColl.truncate();
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
  });
  after(function() {
    usersColl.truncate();
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
  });

  it('users should be able add or remove recovery connections', function() {
    db.connect({ id1: 'b', id2: 'a', level: 'already known', 'timestamp': 1 });
    db.connect({ id1: 'a', id2: 'b', level: 'recovery', 'timestamp': 1 });
    db.connect({ id1: 'c', id2: 'a', level: 'already known', 'timestamp': 2 });
    db.connect({ id1: 'a', id2: 'c', level: 'recovery', 'timestamp': 2 });
    db.connect({ id1: 'd', id2: 'a', level: 'already known', 'timestamp': 3 });
    db.connect({ id1: 'a', id2: 'd', level: 'recovery', 'timestamp': 3 });
    db.connect({ id1: 'e', id2: 'a', level: 'already known', 'timestamp': 4 });
    db.connect({ id1: 'a', id2: 'e', level: 'recovery', 'timestamp': 4 });
    db.connect({ id1: 'f', id2: 'a', level: 'already known', 'timestamp': 5 });
    db.connect({ id1: 'a', id2: 'f', level: 'recovery', 'timestamp': 5 });
    db.connect({ id1: 'a', id2: 'b', level: 'reported', reportReason: 'duplicate', 'timestamp': 6 });
    db.connect({ id1: 'c', id2: 'b', level: 'already known', 'timestamp': 7 });
    db.connect({ id1: 'b', id2: 'c', level: 'recovery', 'timestamp': 7 });
    db.connect({ id1: 'c', id2: 'd', level: 'already known', 'timestamp': 8 });
    db.connect({ id1: 'd', id2: 'c', level: 'recovery', 'timestamp': Date.now() });
    db.connect({ id1: 'b', id2: 'c', level: 'already known', 'timestamp': Date.now() });
    db.connect({ id1: 'a', id2: 'b', level: 'recovery', 'timestamp': Date.now() });
    db.connect({ id1: 'a', id2: 'b', level: 'already known', 'timestamp': Date.now() });

    const recoveryConnections = db.getRecoveryConnections('a', 'outbound');
    const activeRecoveryConnection = Object.values(recoveryConnections).filter(conn => {
      return conn.activeAfter == 0;
    }).map(conn => {
      return conn.id;
    });
    activeRecoveryConnection.should.deep.equal(['c', 'd', 'e', 'f']);
    recoveryConnections['c'].activeBefore.should.be.equal(0);
  });

  it('Should be able to get list of brightids that a user can participate in recovering process of them', function() {
    const inboundRecoveryConnections = db.getRecoveryConnections('c', 'inbound');
    Object.keys(inboundRecoveryConnections).should.deep.equal(['a', 'b', 'd']);
    const activeInboundRecoveryConnection = Object.values(inboundRecoveryConnections).filter(conn => {
      return conn.activeAfter == 0;
    }).map(conn => {
      return conn.id;
    });
    activeInboundRecoveryConnection.should.deep.equal(['a', 'b']);
  });

  it('remove recovery connection should take one week to take effect to protect against takeover', function() {
    db.connect({id1: 'a', id2: 'c', level: 'reported', reportReason: 'duplicate', 'timestamp': Date.now() });

    const recoveryConnections = db.getRecoveryConnections('a', 'outbound');
    recoveryConnections['c'].activeBefore.should.be.greaterThan(0);
    const activeRecoveryConnection = Object.values(recoveryConnections).filter(conn => {
      return conn.activeAfter == 0;
    }).map(conn => {
      return conn.id;
    });
    activeRecoveryConnection.should.deep.equal(['c', 'd', 'e', 'f']);
  });

  it("don't allow a recovery connection to be used for recovery if it is too new", function() {
    db.connect({ id1: 'g', id2: 'a', level: 'already known', 'timestamp': Date.now() });
    db.connect({ id1: 'a', id2: 'g', level: 'recovery', 'timestamp': Date.now() });

    const recoveryConnections = db.getRecoveryConnections('a', 'outbound');
    recoveryConnections['g'].activeAfter.should.be.greaterThan(0);
    const activeRecoveryConnection = Object.values(recoveryConnections).filter(conn => {
      return conn.activeAfter == 0;
    }).map(conn => {
      return conn.id;
    });
    activeRecoveryConnection.should.deep.equal(['c', 'd', 'e', 'f', ]);
  });

  it("ignore cooling period from recovery connections set in the first day", function() {
    connectionsColl.truncate();
    connectionsHistoryColl.truncate();
    const firstConnTime = Date.now() - 4 * 24 * 60 * 60 * 1000;
    db.connect({ id1: 'b', id2: 'a', level: 'already known', 'timestamp': 1 });
    db.connect({ id1: 'a', id2: 'b', level: 'recovery', 'timestamp': firstConnTime });
    db.connect({ id1: 'c', id2: 'a', level: 'already known', 'timestamp': 1 });
    db.connect({ id1: 'a', id2: 'c', level: 'recovery', 'timestamp': firstConnTime + (5 * 60 * 60 * 1000) });
    db.connect({ id1: 'd', id2: 'a', level: 'already known', 'timestamp': 1 });
    db.connect({ id1: 'a', id2: 'd', level: 'recovery', 'timestamp': firstConnTime + (22 * 60 * 60 * 1000) });
    db.connect({ id1: 'e', id2: 'a', level: 'already known', 'timestamp': 1 });
    db.connect({ id1: 'a', id2: 'e', level: 'recovery', 'timestamp': firstConnTime + (30 * 60 * 60 * 1000) });

    const recoveryConnections = db.getRecoveryConnections('a', 'outbound');
    recoveryConnections['e'].activeAfter.should.be.greaterThan(0);
    recoveryConnections['b'].activeAfter.should.be.equal(0);
    recoveryConnections['c'].activeAfter.should.be.equal(0);
    recoveryConnections['d'].activeAfter.should.be.equal(0);
    const activeRecoveryConnection = Object.values(recoveryConnections).filter(conn => {
      return conn.activeAfter == 0;
    }).map(conn => {
      return conn.id;
    });
    activeRecoveryConnection.should.deep.equal(['b', 'c', 'd']);
  });
});