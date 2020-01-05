"use strict";

const db = require('../db.js');
const arango = require('@arangodb').db;
const query = require('@arangodb').query;
const request = require("@arangodb/request");
const nacl = require('tweetnacl');
nacl.setPRNG(function(x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});
const {
  b64ToUrlSafeB64,
  uInt8ArrayToB64,
  strToUint8Array,
  b64ToUint8Array,
  hash
} = require('../encoding');

const { baseUrl } = module.context;

let accountsColl;
const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const newGroupsColl = arango._collection('newGroups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersInNewGroupsColl = arango._collection('usersInNewGroups');
const usersColl = arango._collection('users');
const operationsColl = arango._collection('operations');
const contextsColl = arango._collection('contexts');
const sponsorshipsColl = arango._collection('sponsorships');

const chai = require('chai');
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const u4 = nacl.sign.keyPair();

const contextPublicKey = 'izrhiE6QK+4trDqZ4SKFBRll800teGWOLzFbFvfxvlQ=';
const contextSecretKey = 'blyEVelon1mwqKLbjK8ZK1o4GEkIrUJeaNpXTi+YtP6LOuGITpAr7i2sOpnhIoUFGWXzTS14ZY4vMVsW9/G+VA==';

const account = '0x636D49c1D76ff8E04767C68fe75eC9900719464b';
const contextName = "ethereum";

function apply(op) {
  const resp1 = request.post(`${baseUrl}/addOperation`, {
    body: op,
    json: true
  });
  resp1.status.should.equal(204);
  op = operationsColl.document(op._key);
  delete op._rev;
  delete op._id;
  const resp2 = request.post(`${baseUrl}/applyOperation`, {
    body: op,
    headers: {
      'CONSENSUS-API-KEY': module.context.configuration.consensusAPIKey
    },
    json: true
  });
  resp2.json.success.should.equal(true);
}

describe('operations', function () {
  before(function(){
    accountsColl = arango._create(contextName);
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    operationsColl.truncate();
    contextsColl.truncate();
    sponsorshipsColl.truncate();
    [u1, u2, u3, u4].map((u) => {
      u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
      u.id = b64ToUrlSafeB64(u.signingKey);
      db.createUser(u.id, u.signingKey);
    });
    query`
      UPDATE ${u1.id} WITH {verifications: [${contextName}]} in ${usersColl}
    `;
    query`
      INSERT {
        _key: ${contextName},
        collection: ${contextName},
        verification: ${contextName},
        totalSponsorships: 3,
        signingKey: ${contextPublicKey},
        secretKey: ${contextSecretKey}
      } IN ${contextsColl}
    `;
    
  });
  after(function(){
    arango._drop(accountsColl);
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    operationsColl.truncate();
    sponsorshipsColl.truncate();
  });
  it('should be able to "Add Connection"', function () {
    const connect = (u1, u2) => {
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
      apply(op);
    }
    connect(u1, u2);
    connect(u1, u3);
    connect(u2, u3);
    db.userConnectionsRaw(u1.id).length.should.equal(2);
    db.userConnectionsRaw(u2.id).length.should.equal(2);
    db.userConnectionsRaw(u3.id).length.should.equal(2);
  });

  it('should be able to "Remove Connection"', function () {
    const timestamp = Date.now();
    const message = 'Remove Connection' + u2.id + u3.id + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    
    let op = {
      '_key': hash(message),
      'name': 'Remove Connection',
      'id1': u2.id,
      'id2': u3.id,
      timestamp,
      sig1
    }

    apply(op);
    
    db.userConnectionsRaw(u1.id).length.should.equal(2);
    db.userConnectionsRaw(u2.id).length.should.equal(1);
    db.userConnectionsRaw(u3.id).length.should.equal(1);
  });

  it('should be able to "Add Group"', function () {
    const timestamp = Date.now();
    const message = 'Add Group' + u1.id + u2.id + u3.id + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    
    const op = {
      '_key': hash(message),
      'name': 'Add Group',
      'id1': u1.id,
      'id2': u2.id,
      'id3': u3.id,
      timestamp,
      sig1
    }
    apply(op);
    const groupId = hash([u1.id, u2.id, u3.id].sort().join(','));
    const members = db.groupMembers(groupId, true);
    members.should.include(u1.id);
    members.should.not.include(u2.id);
    members.should.not.include(u3.id);
  });

  it('should be able to "Add Membership"', function () {
    const groupId = db.userNewGroups(u1.id)[0].id;
    [u2, u3].map((u) => {
      const timestamp = Date.now();
      const message = "Add Membership" + u.id + groupId + timestamp;
      const sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
      );
      const op = {
        '_key': hash(message),
        'name': 'Add Membership',
        'id': u.id,
        'group': groupId,
        timestamp,
        sig
      }
      apply(op);
    });
    const members = db.groupMembers(groupId, false);
    members.should.include(u2.id);
    members.should.include(u3.id);
  });

  it('should be able to "Remove Membership"', function () {
    const timestamp = Date.now();
    const groupId = db.userCurrentGroups(u1.id)[0].replace('groups/', '');
    const message = "Remove Membership" + u1.id + groupId + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const op = {
      '_key': hash(message),
      'name': 'Remove Membership',
      'id': u1.id,
      'group': groupId,
      timestamp,
      sig
    }
    apply(op);
    const members = db.groupMembers(groupId, false);
    members.should.not.include(u1.id);
    members.should.include(u2.id);
    members.should.include(u3.id);
  });

  it('should be able to "Set Trusted Connections"', function () {
    const timestamp = Date.now();
    const message = "Set Trusted Connections" + u1.id + [u2.id, u3.id].join(',') + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const op = {
      '_key': hash(message),
      'name': 'Set Trusted Connections',
      'id': u1.id,
      'trusted': [u2.id, u3.id],
      timestamp,
      sig
    }
    apply(op);
    db.loadUser(u1.id).trusted.should.deep.equal([u2.id, u3.id]);
  });

  it('should be able to "Set Signing Key"', function () {
    const timestamp = Date.now();
    const message = "Set Signing Key" + u1.id + u4.signingKey + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u3.secretKey))
    );
    const op = {
      '_key': hash(message),
      'name': 'Set Signing Key',
      'id': u1.id,
      'id1': u2.id,
      'id2': u3.id,
      'signingKey': u4.signingKey,
      timestamp,
      sig1,
      sig2
    }
    apply(op);
    db.loadUser(u1.id).signingKey.should.equal(u4.signingKey);
  });

  it('should be able to "Verify Account"', function () {
    const timestamp = Date.now();
    let message;
    message = 'Verify Account' + ',' + contextName + ',' + account + ',' + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u4.secretKey))
    );
    message = 'Sponsor' + ',' + contextName + ',' + account + ',' + timestamp;
    const sponsorshipSig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(contextSecretKey)))
    );
    
    const op = {
      'name': 'Verify Account',
      'context': contextName,
      timestamp,
      'id': u1.id,
      'account': account,
      '_key': hash(message),
      sig,
      sponsorshipSig
    }
    apply(op);

    message = 'getSignedVerification' + u1.id + contextName;
    const verificationSig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u4.secretKey))
    );
    const resp = request.get(`${baseUrl}/signedVerification/${contextName}/${u1.id}`, {
      headers: { sig: verificationSig }
    });
    const publicKey = resp.json.data.publicKey;
    module.context.configuration.publicKey.should.equal(publicKey);

    message = contextName + ',' + account + ',' + resp.json.data.timestamp;
    nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(resp.json.data.sig), b64ToUint8Array(publicKey)).should.equal(true);
  });
    
});
