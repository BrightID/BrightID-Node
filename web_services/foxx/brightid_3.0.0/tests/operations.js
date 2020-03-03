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
const applyBaseUrl = baseUrl.replace('/brightid3', '/apply');

let contextIdsColl;
const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const newGroupsColl = arango._collection('newGroups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersInNewGroupsColl = arango._collection('usersInNewGroups');
const usersColl = arango._collection('users');
const operationsColl = arango._collection('operations');
const contextsColl = arango._collection('contexts');
const sponsorshipsColl = arango._collection('sponsorships');
const operationsHashesColl = arango._collection('operationsHashes');
const invitationsColl = arango._collection('invitations');

const chai = require('chai');
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const u4 = nacl.sign.keyPair();

const contextPublicKey = 'izrhiE6QK+4trDqZ4SKFBRll800teGWOLzFbFvfxvlQ=';
const contextSecretKey = 'blyEVelon1mwqKLbjK8ZK1o4GEkIrUJeaNpXTi+YtP6LOuGITpAr7i2sOpnhIoUFGWXzTS14ZY4vMVsW9/G+VA==';

const contextId = '0x636D49c1D76ff8E04767C68fe75eC9900719464b';
const contextName = "ethereum";

function apply(op) {
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
}

describe('operations', function(){
  before(function () {
    contextIdsColl = arango._create(contextName);
    operationsHashesColl.truncate();
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    operationsColl.truncate();
    contextsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
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

  after(function () {
    operationsHashesColl.truncate();
    contextsColl.truncate();
    arango._drop(contextIdsColl);
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    newGroupsColl.truncate();
    usersInNewGroupsColl.truncate();
    operationsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
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
    connect(u2, u4);
    connect(u3, u4);
    db.userConnections(u1.id).length.should.equal(2);
    db.userConnections(u2.id).length.should.equal(3);
    db.userConnections(u3.id).length.should.equal(3);
  });

  it('should be able to "Remove Connection"', function () {
    const timestamp = Date.now();
    const reason = "duplicate";
    const message = 'Remove Connection' + u2.id + u3.id + reason + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );

    let op = {
      '_key': hash(message),
      'name': 'Remove Connection',
      'id1': u2.id,
      'id2': u3.id,
      reason,
      timestamp,
      sig1
    }

    apply(op);

    db.userConnections(u1.id).length.should.equal(2);
    db.userConnections(u2.id).length.should.equal(2);
    db.userConnections(u3.id).length.should.equal(2);
  });

  it('should be able to "Add Group"', function () {
    const timestamp = Date.now();
    const message = 'Add Group' + u1.id + u2.id + u3.id + 'primary' + timestamp;
    const sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );

    const op = {
      '_key': hash(message),
      'name': 'Add Group',
      'id1': u1.id,
      'id2': u2.id,
      'id3': u3.id,
      'type': 'primary',
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
    const groupId = db.userNewGroups(u1.id)[0];
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
    const groupId = db.userCurrentGroups(u1.id);
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

  it('admins should be able to "Invite" someone to the group', function () {
    const timestamp = Date.now();
    const groupId = db.userCurrentGroups(u2.id)[0];
    const message = "Invite" + u2.id + u4.id + groupId + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const op = {
      '_key': hash(message),
      'name': 'Invite',
      'inviter': u2.id,
      'invitee': u4.id,
      'group': groupId,
      timestamp,
      sig
    }
    apply(op);
    invitationsColl.byExample({
      '_from': 'users/' + u4.id,
      '_to': 'groups/' + groupId
    }).count().should.equal(1);
  });

  it('admins should be able to "Dismiss" someone from the group', function () {
    const timestamp = Date.now();
    const groupId = db.userCurrentGroups(u2.id)[0];
    db.addMembership(groupId, u4.id, Date.now());
    db.groupMembers(groupId).should.include(u4.id);
    const message = "Dismiss" + u2.id + u4.id + groupId + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const op = {
      '_key': hash(message),
      'name': 'Dismiss',
      'dismisser': u2.id,
      'dismissee': u4.id,
      'group': groupId,
      timestamp,
      sig
    }
    apply(op);
    db.groupMembers(groupId).should.not.include(u4.id);
  });

  it('admins should be able to "Add Admin" to the group', function () {
    const timestamp = Date.now();
    const groupId = db.userCurrentGroups(u2.id)[0];
    db.invite(u2.id, u4.id, groupId, Date.now());
    db.addMembership(groupId, u4.id, Date.now());
    db.groupMembers(groupId).should.include(u4.id);
    const message = "Add Admin" + u2.id + u4.id + groupId + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const op = {
      '_key': hash(message),
      'name': 'Add Admin',
      'id': u2.id,
      'admin': u4.id,
      'group': groupId,
      timestamp,
      sig
    }
    apply(op);
    groupsColl.document(groupId).admins.should.include(u4.id);
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

  it('should be able to "Link ContextId"', function () {
    const timestamp = Date.now();
    const message = 'Link ContextId' + ',' + contextName + ',' + contextId + ',' + timestamp;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u4.secretKey))
    );
    const op = {
      'name': 'Link ContextId',
      'context': contextName,
      timestamp,
      'id': u1.id,
      contextId,
      '_key': hash(message),
      sig
    }
    apply(op);
    db.getContextIdsByUser(contextIdsColl, u1.id)[0].should.equal(contextId);

  });

  it('should be able to "Sponsor"', function () {
    const message = 'Sponsor' + ',' + contextName + ',' + contextId;
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(contextSecretKey)))
    );
    const op = {
      'name': 'Sponsor',
      'context': contextName,
      contextId,
      '_key': hash(message),
      sig
    }
    apply(op);
    db.isSponsored(u1.id).should.equal(true);
  });

});
