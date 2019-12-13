"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const request = require("@arangodb/request");
const nacl = require('tweetnacl');
nacl.setPRNG(function(x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});
const { b64ToUrlSafeB64, uInt8ArrayToB64, strToUint8Array, b64ToUint8Array } = require('../encoding');
const safe = b64ToUrlSafeB64;

const { baseUrl } = module.context;

const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const newGroupsColl = arango._collection('newGroups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersInNewGroupsColl = arango._collection('usersInNewGroups');
const usersColl = arango._collection('users');
const recoveryColl = arango._collection('recovery');

const chai = require('chai');
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const newPair = nacl.sign.keyPair();
[u1, u2, u3, newPair].map((u) => {
  u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
  u.id = safe(u.signingKey);
});

describe('router', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
  });
  
  it('should be able to create users', function () {
    let resp;
    [u1, u2, u3].map((u) => {
      const resp = request.post(`${baseUrl}/users`, {
        body: { 
          id: u.id,
          signingKey: u.signingKey
        },
        json: true,
      });
      resp.json.should.deep.equal({data: { id: u.id, score: 0 }});
    });
  });
  
  it('should be able to add connections', function () {
    const connect = (u1, u2) => {
      const timestamp = Date.now();
      const message = u1.id + u2.id + timestamp;
      const sig1 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
      );
      const sig2 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
      );
      const resp = request.put(`${baseUrl}/connections`, {
        body: { id1: u1.id, id2: u2.id, sig1, sig2, timestamp },
        json: true
      });
      resp.status.should.equal(204);
    }
    connect(u1, u2);
    connect(u2, u3);
    connect(u3, u1);
    db.userConnectionsRaw(u1.id).length.should.equal(2);
    db.userConnectionsRaw(u2.id).length.should.equal(2);
    db.userConnectionsRaw(u3.id).length.should.equal(2);
  });
  
  it('should be able to delete a connection', function () {
    const timestamp = Date.now();
    const message = u2.id + u3.id + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const resp = request.delete(`${baseUrl}/connections`, {
      body: { id1: u2.id, id2: u3.id, sig1, timestamp },
      json: true
    });
    resp.status.should.equal(204);
    db.userConnectionsRaw(u1.id).length.should.equal(2);
    db.userConnectionsRaw(u2.id).length.should.equal(1);
    db.userConnectionsRaw(u3.id).length.should.equal(1);
  });
  
  it('should be able to create a group', function () {
    const timestamp = Date.now();
    const message = u1.id + u2.id + u3.id + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp = request.post(`${baseUrl}/groups`, {
      body: { id1: u1.id, id2: u2.id, id3: u3.id, sig1, timestamp },
      json: true
    });
    resp.status.should.equal(200);
    const members = db.groupMembers(resp.json.data.id, true);
    members.should.include(u1.id);
    members.should.not.include(u2.id);
    members.should.not.include(u3.id);
  });
  
  it('should be able to join a group', function () {
    const timestamp = Date.now();
    const group = db.userNewGroups(u1.id)[0].id;
    [u2, u3].map((u) => {
      const message = u.id + group + timestamp;
      const sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
      );
      const resp = request.put(`${baseUrl}/membership`, {
        body: { id: u.id, group, sig, timestamp },
        json: true
      });
      resp.status.should.equal(204);
    });
    const members = db.groupMembers(group);
    members.should.include(u2.id);
    members.should.include(u3.id);
  });

  it('should be able to leave a group', function () {
    const timestamp = Date.now();
    const group = db.userCurrentGroups(u1.id)[0].replace('groups/', '');
    const message = u2.id + group + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const resp = request.delete(`${baseUrl}/membership`, {
      body: { id: u2.id, group, sig, timestamp },
      json: true
    });
    resp.status.should.equal(204);
    const members = db.groupMembers(group, true);
    members.should.not.include(u2.id);
  });
  
  it('should be able to fetch user info', function () {
    const timestamp = Date.now();
    const message = u1.id + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp = request.post(`${baseUrl}/fetchUserInfo`, {
      body: { id: u1.id, sig, timestamp },
      json: true
    });
    resp.status.should.equal(200);
    resp.json.data.connections.length.should.equal(2);
    resp.json.data.currentGroups.length.should.equal(1);
  });

  it('should be able to set trusted connections', function () {
    const timestamp = Date.now();
    const message = u1.id + [u2.id, u3.id].join(',') + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp = request.put(`${baseUrl}/trusted`, {
      body: { id: u1.id, trusted: [u2.id, u3.id], sig, timestamp },
      json: true
    });
    resp.status.should.equal(204);
    db.loadUser(u1.id).trusted.should.deep.equal([u2.id, u3.id]);
  });

  it('should be able to update signing key', function () {
    const timestamp = Date.now();
    const message = u1.id + newPair.signingKey + timestamp;
    const sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const sig3 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u3.secretKey))
    );
    const sigs = [{ id: u2.id, sig: sig2 }, { id: u3.id, sig: sig3 }]
    const resp = request.put(`${baseUrl}/signingKey`, {
      body: { id: u1.id, signingKey: newPair.signingKey, sigs, timestamp },
      json: true
    });
    resp.status.should.equal(204);
    db.loadUser(u1.id).signingKey.should.equal(newPair.signingKey);
  });

  it('should be able to use new signing key', function () {
    const timestamp = Date.now();
    const message = u1.id + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), newPair.secretKey))
    );
    const resp = request.post(`${baseUrl}/fetchUserInfo`, {
      body: { id: u1.id, sig, timestamp },
      json: true
    });
    resp.status.should.equal(200);
  });
  
});
