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
const { strToUint8Array, uInt8ArrayToB64, b64ToUrlSafeB64 } = require('../encoding');

const { baseUrl } = module.context;

const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersColl = arango._collection('users');
const operationsColl = arango._collection('operations');

const chai = require('chai');
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
[u1, u2, u3].map((u) => {
  u.publicKey = uInt8ArrayToB64(Object.values(u.publicKey));
  u.safePublicKey = b64ToUrlSafeB64(u.publicKey);
});

describe('replay attack on add/remove connections/membership/groups', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    db.createUser(u1.safePublicKey);
    db.createUser(u2.safePublicKey);
    db.createUser(u3.safePublicKey);
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
  });

  it('should not be able to call PUT /connections with same parameters twice', function () {
    const connect = (u1, u2, timestamp) => {
      const message = u1.publicKey + u2.publicKey + timestamp;
      const sig1 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
      );
      const sig2 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
      );
      const resp = request.put(`${baseUrl}/connections`, {
        body: { publicKey1: u1.publicKey, publicKey2: u2.publicKey, sig1, sig2, timestamp },
        json: true
      });
      return resp;
    }
    connect(u1, u2, 1).status.should.equal(204);
    connect(u2, u3, 1).status.should.equal(204);
    connect(u3, u1, 1).status.should.equal(204);
    connect(u1, u2, 1).status.should.equal(403);
  });
  
  it('should not be able to call DELETE /connections with same parameters twice', function () {
    const timestamp = Date.now();
    const message = u2.publicKey + u3.publicKey + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const resp1 = request.delete(`${baseUrl}/connections`, {
      body: { publicKey1: u2.publicKey, publicKey2: u3.publicKey, sig1, timestamp },
      json: true
    });
    resp1.status.should.equal(204);
    const resp2 = request.delete(`${baseUrl}/connections`, {
      body: { publicKey1: u1.publicKey, publicKey2: u2.publicKey, sig1, timestamp },
      json: true
    });
    resp2.status.should.equal(403);
  });
  
  it('should not be able to call POST /groups twice with same parameters', function () {
    const timestamp = Date.now();
    const message = u1.publicKey + u2.publicKey + u3.publicKey + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp1 = request.post(`${baseUrl}/groups`, {
      body: { publicKey1: u1.publicKey, publicKey2: u2.publicKey, publicKey3: u3.publicKey, sig1, timestamp },
      json: true
    });
    resp1.status.should.equal(200);
    const resp2 = request.post(`${baseUrl}/groups`, {
      body: { publicKey1: u1.publicKey, publicKey2: u2.publicKey, publicKey3: u3.publicKey, sig1, timestamp },
      json: true
    });
    resp2.status.should.equal(403);
  });

  it('should not be able to call PUT /membership twice with same parameters', function () {
    const timestamp = Date.now();
    const group = db.userNewGroups(u1.safePublicKey)[0].id;
    const message = u2.publicKey + group + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const resp1 = request.put(`${baseUrl}/membership`, {
      body: { publicKey: u2.publicKey, group, sig, timestamp },
      json: true
    });
    resp1.status.should.equal(204);
    const resp2 = request.put(`${baseUrl}/membership`, {
      body: { publicKey: u2.publicKey, group, sig, timestamp },
      json: true
    });
    resp2.status.should.equal(403);
  });

  it('should be able to call DELETE /membership twice with same parameters', function () {
    const timestamp = Date.now();
    const group = db.userNewGroups(u1.safePublicKey)[0].id;
    const message = u2.publicKey + group + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const resp1 = request.delete(`${baseUrl}/membership`, {
      body: { publicKey: u2.publicKey, group, sig, timestamp },
      json: true
    });
    resp1.status.should.equal(204);
    const resp2 = request.delete(`${baseUrl}/membership`, {
      body: { publicKey: u2.publicKey, group, sig, timestamp },
      json: true
    });
    resp2.status.should.equal(403);
  });
  
  it('should not be able to call DELETE /groups twice with same parameters', function () {
    const timestamp = Date.now();
    const group = db.userNewGroups(u1.safePublicKey)[0].id;
    const message = u1.publicKey + group + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp1 = request.delete(`${baseUrl}/groups`, {
      body: { publicKey: u1.publicKey, group: group, sig, timestamp },
      json: true
    });
    resp1.status.should.equal(204);
    const resp2 = request.delete(`${baseUrl}/groups`, {
      body: { publicKey: u1.publicKey, group: group, sig, timestamp },
      json: true
    });
    resp2.status.should.equal(403);
  });  
});
