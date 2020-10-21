"use strict";

const db = require('../db.js');
const { getMessage } = require('../operations');
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
const applyBaseUrl = baseUrl.replace('/brightid5', '/apply5');

let contextIdsColl;
const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersColl = arango._collection('users');
const operationsColl = arango._collection('operations');
const contextsColl = arango._collection('contexts');
const appsColl = arango._collection('apps');
const sponsorshipsColl = arango._collection('sponsorships');
const operationsHashesColl = arango._collection('operationsHashes');
const invitationsColl = arango._collection('invitations');
const verificationsColl = arango._collection('verifications');

const chai = require('chai');
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const u4 = nacl.sign.keyPair();

let { publicKey: sponsorPublicKey, secretKey: sponsorPrivateKey } = nacl.sign.keyPair();
let { secretKey: linkAESKey } = nacl.sign.keyPair();

const contextId = '0x636D49c1D76ff8E04767C68fe75eC9900719464b';
const contextName = "ethereum";
const appName = "ethereum";
const idsAsHex = true;

function apply(op) {
  const resp1 = request.post(`${baseUrl}/operations`, {
    body: op,
    json: true
  });
  resp1.status.should.equal(200);
  let h = hash(getMessage(op));
  resp1.json.data.hash.should.equal(h);
  if (op.name == 'Sponsor') {
    if (idsAsHex) {
      op.contextId = op.contextId.toLowerCase();
    }
    op.id = db.getUserByContextId(contextIdsColl, op.contextId);
    delete op.contextId;
    h = hash(getMessage(op));
  }
  op = operationsColl.document(h);
  delete op._rev;
  delete op._id;
  delete op._key;
  delete op.hash;
  delete op.state;
  const resp2 = request.put(`${applyBaseUrl}/operations/${h}`, {
    body: op,
    json: true
  });
  resp2.json.success.should.equal(true);
}

describe('operations', function(){
  before(function () {
    contextIdsColl = arango._collection(contextName);
    if(contextIdsColl){
      contextIdsColl.truncate();
    } else {
      contextIdsColl = arango._create(contextName);
    }
    operationsHashesColl.truncate();
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    contextsColl.truncate();
    appsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
    verificationsColl.truncate();
    [u1, u2, u3, u4].map((u) => {
      u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
      u.id = b64ToUrlSafeB64(u.signingKey);
      db.createUser(u.id, Date.now());
    });
    query`
      UPDATE ${u1.id} WITH {verifications: [${contextName}]} in ${usersColl}
    `;
    query`
      INSERT {
        _key: ${contextName},
        collection: ${contextName},
        verification: ${contextName},
        linkAESKey: ${uInt8ArrayToB64(Object.values(linkAESKey))},
        idsAsHex: ${idsAsHex}
      } IN ${contextsColl}
    `;
    query`
      INSERT {
        _key: ${appName},
        context: ${contextName},
        totalSponsorships: 3,
        sponsorPublicKey: ${uInt8ArrayToB64(Object.values(sponsorPublicKey))},
        sponsorPrivateKey: ${uInt8ArrayToB64(Object.values(sponsorPrivateKey))}
      } IN ${appsColl}
    `;
  });

  after(function () {
    operationsHashesColl.truncate();
    contextsColl.truncate();
    appsColl.truncate();
    arango._drop(contextIdsColl);
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
    verificationsColl.truncate();
  });
  it('should be able to "Add Connection" with v5 and v4 clients', function () {
    const connect = (u1, u2, v4signing) => {
      const timestamp = Date.now();
      let op = {
        'v': 5,
        'name': 'Add Connection',
        'id1': u1.id,
        'id2': u2.id,
        timestamp
      }
      const message = getMessage(op);
      op.sig1 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
      );
      if (!v4signing) {
        op.sig2 = uInt8ArrayToB64(
          Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
        );
      } else {
        const v4message = op.name + op.id1 + op.id2 + op.timestamp;
        op.sig2 = uInt8ArrayToB64(
          Object.values(nacl.sign.detached(strToUint8Array(v4message), u2.secretKey))
        );
      }

      apply(op);
    }
    connect(u1, u2);
    connect(u1, u3);
    connect(u2, u3);
    connect(u2, u4);
    connect(u3, u4, true);
    db.userConnections(u1.id).length.should.equal(2);
    db.userConnections(u2.id).length.should.equal(3);
    db.userConnections(u3.id).length.should.equal(3);
  });

  it('should be able to "Remove Connection"', function () {
    const timestamp = Date.now();
    const reason = "duplicate";

    let op = {
      'v': 5,
      'name': 'Remove Connection',
      'id1': u2.id,
      'id2': u3.id,
      reason,
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    connectionsColl.firstExample({
      '_from': 'users/' + u2.id,
      '_to': 'users/' + u3.id,
    }).flagReason.should.equal(reason);
    connectionsColl.firstExample({
      '_from': 'users/' + u3.id,
      '_to': 'users/' + u2.id,
    }).level.should.equal('just met');
  });

  it('should be able to "Add Group"', function () {
    const timestamp = Date.now();
    const type = 'general';
    const url = 'http://url.com/dummy';
    const groupId = hash('randomstr');

    const op = {
      'v': 5,
      'name': 'Add Group',
      'group': groupId,
      'id1': u1.id,
      'id2': u2.id,
      'inviteData2': 'data',
      'id3': u3.id,
      'inviteData3': 'data',
      url,
      type,
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);

    const members = db.groupMembers(groupId);
    members.should.include(u1.id);
    members.should.not.include(u2.id);
    members.should.not.include(u3.id);
  });

  it('should be able to "Add Membership"', function () {
    const groupId = db.userGroups(u1.id)[0].id;
    [u2, u3].map((u) => {
      const timestamp = Date.now();
      const op = {
        'v': 5,
        'name': 'Add Membership',
        'id': u.id,
        'group': groupId,
        timestamp,
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
      );
      apply(op);
    });
    const members = db.groupMembers(groupId);
    members.should.include(u2.id);
    members.should.include(u3.id);
  });

  it('should be able to "Remove Membership"', function () {
    const timestamp = Date.now();
    const groupId = db.userGroups(u1.id)[0].id;
    const op = {
      'v': 5,
      'name': 'Remove Membership',
      'id': u1.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);

    const members = db.groupMembers(groupId, false);
    members.should.not.include(u1.id);
    members.should.include(u2.id);
    members.should.include(u3.id);
  });

  it('admins should be able to "Invite" someone to the group', function () {
    const timestamp = Date.now();
    const groupId = db.userGroups(u2.id)[0].id;
    const data = 'some data';
    const op = {
      'v': 5,
      'name': 'Invite',
      'inviter': u2.id,
      'invitee': u4.id,
      'group': groupId,
      data,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    invitationsColl.byExample({
      '_from': 'users/' + u4.id,
      '_to': 'groups/' + groupId
    }).count().should.equal(1);
  });

  it('admins should be able to "Dismiss" someone from the group', function () {
    const timestamp = Date.now();
    const groupId = db.userGroups(u2.id)[0].id;
    db.addMembership(groupId, u4.id, Date.now());
    db.groupMembers(groupId).should.include(u4.id);
    const op = {
      'v': 5,
      'name': 'Dismiss',
      'dismisser': u2.id,
      'dismissee': u4.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    db.groupMembers(groupId).should.not.include(u4.id);
  });

  it('admins should be able to "Add Admin" to the group', function () {
    const timestamp = Date.now();
    const groupId = db.userGroups(u2.id)[0].id;
    db.invite(u2.id, u4.id, groupId, 'data', Date.now());
    db.addMembership(groupId, u4.id, Date.now());
    db.groupMembers(groupId).should.include(u4.id);
    const op = {
      'v': 5,
      'name': 'Add Admin',
      'id': u2.id,
      'admin': u4.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    groupsColl.document(groupId).admins.should.include(u4.id);
  });

  it('should be able to "Set Trusted Connections"', function () {
    const timestamp = Date.now();
    const op = {
      'v': 5,
      'name': 'Set Trusted Connections',
      'id': u1.id,
      'trusted': [u2.id, u3.id],
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    connectionsColl.firstExample({
      '_from': 'users/' + u1.id,
      '_to': 'users/' + u2.id,
    }).level.should.equal('recovery');
    connectionsColl.firstExample({
      '_from': 'users/' + u1.id,
      '_to': 'users/' + u2.id,
    }).level.should.equal('recovery');
  });

  it('should be able to "Set Signing Key" with sigs provided by clients v5 and v4', function () {
    const timestamp = Date.now();
    const op = {
      'v': 5,
      'name': 'Set Signing Key',
      'id': u1.id,
      'id1': u2.id,
      'id2': u3.id,
      'signingKey': u4.signingKey,
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    const v4message = op.name + op.id + op.signingKey + op.timestamp;
    op.sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(v4message), u3.secretKey))
    );
    apply(op);
    db.loadUser(u1.id).signingKey.should.equal(u4.signingKey);
    u1.secretKey = u4.secretKey;
  });

  it('should be able to "Link ContextId"', function () {
    const timestamp = Date.now();
    const op = {
      'v': 5,
      'name': 'Link ContextId',
      'context': contextName,
      timestamp,
      'id': u1.id,
      contextId,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u4.secretKey))
    );
    apply(op);
    let cId;
    if (idsAsHex) {
      cId = contextId.toLowerCase();
    } else {
      cId = contextId;
    }
    db.getContextIdsByUser(contextIdsColl, u1.id)[0].should.equal(cId);
  });

  it('should be able to "Sponsor"', function () {
    const timestamp = Date.now();
    const op = {
      'v': 5,
      'name': 'Sponsor',
      'app': appName,
      timestamp,
      contextId,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), sponsorPrivateKey))
    );
    apply(op);
    db.isSponsored(u1.id).should.equal(true);
  });

  it('should be able to "Connect"', function () {
    const timestamp = Date.now();

    let op = {
      'v': 5,
      'name': 'Connect',
      'id1': u1.id,
      'id2': u2.id,
      'level': 'just met',
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    connectionsColl.firstExample({
      '_from': 'users/' + u1.id,
      '_to': 'users/' + u2.id,
    }).level.should.equal('just met');
  });

});
