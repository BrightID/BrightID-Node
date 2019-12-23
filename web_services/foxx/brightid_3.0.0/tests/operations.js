"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const request = require("@arangodb/request");
const crypto = require('@arangodb/crypto')
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
const operationsColl = arango._collection('operations');

const chai = require('chai');
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const newPair = nacl.sign.keyPair();

function hash(data) {
  const h = crypto.sha256(data);
  const b = Buffer.from(h, 'hex').toString('base64');
  return b64ToUrlSafeB64(b);
}

describe('router', function () {
  before(function(){
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    operationsColl.truncate();
    [u1, u2, u3].map((u) => {
      u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
      u.id = safe(u.signingKey);
      db.createUser(u.id, u.signingKey);
    });
    db.addConnection(u1.id, u2.id, Date.now());
    db.addConnection(u1.id, u3.id, Date.now());
  });
  after(function(){
    // usersColl.truncate();
    // connectionsColl.truncate();
    // groupsColl.truncate();
    // usersInGroupsColl.truncate();
    // newGroupsColl.truncate();
    // usersInNewGroupsColl.truncate();
    // operations.truncate();
  });
  
  it('should be able to add an operation', function () {
    const timestamp = Date.now();
    const message = 'Add Group' + u1.id + u2.id + u3.id + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    
    const op = {
      'name': 'Add Group',
      timestamp,
      'id1': u1.id,
      'id2': u2.id,
      'id3': u3.id,
      '_key': hash(message),
      sig1
    }

    const resp = request.post(`${baseUrl}/addOperation`, {
      body: op,
      json: true
    });
    resp.status.should.equal(204);
  });
    
});
