"use strict";

const arango = require('@arangodb').db;
const request = require("@arangodb/request");
const nacl = require('tweetnacl');
nacl.setPRNG(function(x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});
const {
  strToUint8Array,
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  hash 
} = require('../encoding');
const db = require('../db.js');

const { baseUrl } = module.context;
const applyBaseUrl = baseUrl.replace('/brightid', '/apply');

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
  u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
  u.id = b64ToUrlSafeB64(u.signingKey);
});

describe('replay attack on operations', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    db.createUser(u1.id, u1.signingKey);
    db.createUser(u2.id, u2.signingKey);
    db.createUser(u3.id, u3.signingKey);
  });
  after(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
  });

  it('should not be able to add an operation twice', function () {
    const timestamp = Date.now();
    const message = 'Add Connection' + u1.id + u2.id + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    
    let op = {
      '_key': hash(message),
      'name': 'Add Connection',
      'id1': u1.id,
      'id2': u2.id,
      timestamp,
      sig1,
      sig2
    }

    const resp1 = request.put(`${baseUrl}/operations/${op._key}`, {
      body: op,
      json: true
    });
    resp1.status.should.equal(204);

    op = operationsColl.document(op._key);
    delete op._rev;
    delete op._id;
    const resp2 = request.put(`${applyBaseUrl}/operations/${op._key}`, {
      body: op,
      json: true
    });
    resp2.json.success.should.equal(true);
    resp2.json.state.should.equal('applied');

    const resp3 = request.put(`${baseUrl}/operations/${op._key}`, {
      body: op,
      json: true
    });
    resp3.status.should.equal(400);
    resp3.json.errorMessage.should.equal('operation is applied before');
    
    const resp4 = request.put(`${applyBaseUrl}/operations/${op._key}`, {
      body: op,
      json: true
    });
    resp4.json.success.should.equal(true);
    resp4.json.state.should.equal('duplicate');
  });
});
