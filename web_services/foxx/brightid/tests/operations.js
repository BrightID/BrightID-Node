"use strict";

const db = require('../db.js');
const errors = require('../errors.js');
const _ = require('lodash');
const { getMessage } = require('../operations');
const arango = require('@arangodb').db;
const query = require('@arangodb').query;
const request = require("@arangodb/request");
const nacl = require('tweetnacl');
const NodeRSA = require('node-rsa');
const stringify = require('fast-json-stable-stringify');
const BlindSignature = require('../rsablind');

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
const applyBaseUrl = baseUrl.replace('/brightid6', '/apply6');

const connectionsColl = arango._collection('connections');
const groupsColl = arango._collection('groups');
const usersInGroupsColl = arango._collection('usersInGroups');
const usersColl = arango._collection('users');
const operationsColl = arango._collection('operations');
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
const u5 = nacl.sign.keyPair();
const u6 = nacl.sign.keyPair();
const u7 = nacl.sign.keyPair();
const u8 = nacl.sign.keyPair();
const u9 = nacl.sign.keyPair();
const u10 = nacl.sign.keyPair();
const u11 = nacl.sign.keyPair();

const key = new NodeRSA();
key.importKey({
    n: Buffer.from('00abc6299d6c1b56e0f70982fc20c9e2e81f064560b0a2714cc8c4728574293d4591ada8a64c489c72a6e117a71bf3cf8ee2a5c313ae0fa99981186c4196e7740c3eb8b73b629db5f1a53a929f29052ce307bb0063c2634667da9af67637d3df6e4cc679c05561fa4d04712777e32a990bee7d32fd0edd1297adc6eec55ba90fa0b8f4720de04237662c962a8ade1a2bcc56c7e76d738fd05b630afee115cc0a11c512b0b612d1573af40ac8d5c072cf72c11bbdf9707c7a6f20aecdfbf5ef656c4dc3869c20a69aeec5608c2fba71ccd2224f9e938d58fe47184816e6cb93c4cbd3c9b10ee3cdf5f902c7dcded8247bd805319ec3d132122f13d670850c80856f', 'hex'),
    e: 65537,
    d: Buffer.from('691c6684ad0d81b94191b174650004f8735b9c0291b3a54f0e1f9fd068078035dcf1fe1c5cdba5d846a3c09c826f4c182c3ab0c78f208870a55d73892335587ed1b6a8710f64605c90f5e998b93a3080704f8eea7c9dd10c65e9a35d2dc659979e25698536fa3077067bd361fa412bcbf050ee6d89b5dfd5af01e7441f55b1786fff8c08318854d96aaf6d35e44e6a12d4d4ae46279429c9e4345d7efa1bbce25ba87629432d725f2b31d4ca52639cc0f447f0eeffe827230efaa2c77a09570ea4a876ff349702d519bc69fc5467dc4ebe1d0f3f87d21cb2f8e63cdc210ea1142f359016de570ddeb5dfd80297e6c956111f53b468882235288ee3bf8d936ea1', 'hex'),
    p: Buffer.from('00de660d6baabc0fb503fc9f63f59804680a9688993b74a119f4ed48a24bdf3e3de1a2990b5b4698095d0247f374dcfe51bbb007d692987808935bcb079c5e7035cc924fdb06308797f3e3ac5c1c0eab5a405eab3b64ce8ae6b4acbb204a46224aebcb6fe86b5ce81a40afc16824e0c4d730f9532c9da990082332ecc4ce96eb3f', 'hex'),
    q: Buffer.from('00c5ba0cd2b04a13b00334b3fdf2b030903adbb3cd37a35e81a13218b5a3f516a7bad88f837ce0ff7f6f141899e2a713c028229e499f54add129c649967ffa30b6d5d1852584f9d94606a250d13c31adda0bdb60d196070f96900416b8d9e6fad728b95fbb2de02f2cb8e5f713177a460dad1952c6198e187ef3a03ce8e3eac9d1', 'hex'),
    dmp1: Buffer.from('1d23cc005e7793ab49217194fc59f5c1d8194f3e9c9eb4791d317601e5e51357b257c6abc942dfaae267e91b8a2566a138f160a589c1b680912646dcf16d2250ba44357862403b93fa5dcb78aa2875e53667f111b02cabe07cade13ae2e07b9fcb73756f439a01c366d460880fc4efa5ae820c96dcf599aca74805e3e799b8ab', 'hex'),
    dmq1: Buffer.from('6fbb8507820b3a38da76ebc7735ed0f28ff01b18ba7a1d2b8f95a994eb43d23b92405248f1468bdacd4043eea1bfdc4f57dec827be5bb1a562bfe451a19c15ef1bc0bc46c9700eb19d8a17b54518a5af73c7d25c5d353c3fcebe20c0f091afe9e9df671375071c615f52c45e0b845315e35d4e0317e9ce39df1e0b8d674e0421', 'hex'),
    coeff: Buffer.from('00cb68b014c91b59768ad3788751ad98b125a64cf617f5f46aa57fda8f746d57ce2991eac5fd544abec7f3fea1d0e50df870254a425485f0e0eed88169f725ab48be4865c4492b088f13f94cb1b691f2946e50d239373d1320329c0a7e9db1987c52025ff3bef4e4ced879c3044ca593d8975408af381cd3a6223c91932398a320', 'hex')
}, 'components');
const N = key.keyPair.n.toString();
const E = key.keyPair.e.toString();

function apply(op) {
  let resp = request.post(`${baseUrl}/operations`, {
    body: op,
    json: true
  });
  resp.status.should.equal(200);
  let h = hash(getMessage(op));
  resp.json.data.hash.should.equal(h);
  op = operationsColl.document(h);
  op = _.omit(op, ['_rev','_id', '_key', 'hash', 'state']);
  op.blockTime = op.timestamp;
  resp = request.put(`${applyBaseUrl}/operations/${h}`, {
    body: op,
    json: true
  });
  resp.json.success.should.equal(true);
  return resp;
}

function connect(u1, u2, level) {

  const timestamp = Date.now();
  let op = {
    'v': 6,
    'name': 'Connect',
    'id1': u1.id,
    'id2': u2.id,
    level,
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
  }).level.should.equal(level);

}

describe('operations', function(){
  before(function () {
    operationsHashesColl.truncate();
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    appsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
    verificationsColl.truncate();
    [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10, u11].map((u) => {
      u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
      u.id = b64ToUrlSafeB64(u.signingKey);
      db.createUser(u.id, Date.now());
    });
    appsColl.insert({
      _key: 'idchain',
      sponsorPublicKey: stringify({ n: N, e: E }),
      verificationExpirationLength: 1000000,
      idsAsHex: false
    });
  });

  after(function () {
    operationsHashesColl.truncate();
    appsColl.truncate();
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
    verificationsColl.truncate();
  });

  it('should be able to "Connect"', function () {
    connect(u1, u2, 'just met');
    connect(u2, u1, 'just met');
    connect(u1, u3, 'just met');
    connect(u3, u1, 'just met');
    connect(u2, u3, 'just met');
    connect(u2, u4, 'just met');
    connect(u3, u4, 'just met');
  });

  it('should be able to "Sponsor"', function () {
    // client
    const timestamp = Date.now();
    let op = {
      name: 'Sponsor',
      id: u1.id,
      app: 'idchain',
      timestamp,
      v: 6
    }
    const message = stringify(op);
    const { blinded, r } = BlindSignature.blind({ message, N, E });
    // app
    const signed = BlindSignature.sign({ blinded, key });
    // client
    const unblinded = BlindSignature.unblind({ signed, N, r });
    op.sig = unblinded.toString();
    apply(op);
    db.isSponsored(u1.id).should.equal(true);
  });

  it('should be able to report using "Connect" by providing requestProof', function () {
    const timestamp = Date.now();

    const requestProofMessage = u1.id + '|' + timestamp;
    const requestProof = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(requestProofMessage), u1.secretKey))
    );
    let op = {
      'v': 6,
      'name': 'Connect',
      'id1': u2.id,
      'id2': u1.id,
      'level': 'reported',
      'reportReason': 'spammer',
      requestProof,
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    const conn = connectionsColl.firstExample({
      '_from': 'users/' + u2.id,
      '_to': 'users/' + u1.id,
    })
    conn.level.should.equal('reported');
    conn.requestProof.should.equal(requestProof);
  });

  it('should be able to "Add Group"', function () {
    const timestamp = Date.now();
    const type = 'general';
    const url = 'http://url.com/dummy';
    const groupId = hash('randomstr');

    const op = {
      'v': 6,
      'name': 'Add Group',
      'group': groupId,
      'id1': u1.id,
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
  });

  it('should be able to "Add Membership"', function () {
    const groupId = db.userMemberships(u1.id)[0].id;
    const timestamp = Date.now();
    db.invite(u1.id, u2.id, groupId, 'data', timestamp);
    const op = {
      'v': 6,
      'name': 'Add Membership',
      'id': u2.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    const members = db.groupMembers(groupId);
    members.should.include(u2.id);
  });

  it('should be able to "Remove Membership"', function () {
    const timestamp = Date.now();
    const groupId = db.userMemberships(u1.id)[0].id;
    const op = {
      'v': 6,
      'name': 'Remove Membership',
      'id': u2.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    const members = db.groupMembers(groupId, false);
    members.should.not.include(u2.id);
    members.should.include(u1.id);
  });

  it('admins should be able to "Invite" someone to the group', function () {
    const timestamp = Date.now();
    const groupId = db.userMemberships(u1.id)[0].id;
    const data = 'some data';
    const op = {
      'v': 6,
      'name': 'Invite',
      'inviter': u1.id,
      'invitee': u2.id,
      'group': groupId,
      data,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    invitationsColl.byExample({
      '_from': 'users/' + u2.id,
      '_to': 'groups/' + groupId
    }).count().should.equal(1);
  });

  it('admins should be able to "Dismiss" someone from the group', function () {
    const timestamp = Date.now();
    const groupId = db.userMemberships(u1.id)[0].id;
    db.addMembership(groupId, u2.id, Date.now());
    db.groupMembers(groupId).should.include(u2.id);
    const op = {
      'v': 6,
      'name': 'Dismiss',
      'dismisser': u1.id,
      'dismissee': u2.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    db.groupMembers(groupId).should.not.include(u2.id);
  });

  it('admins should be able to "Add Admin" to the group', function () {
    const timestamp = Date.now();
    const groupId = db.userMemberships(u1.id)[0].id;
    db.invite(u1.id, u2.id, groupId, 'data', Date.now());
    db.addMembership(groupId, u2.id, Date.now());
    db.groupMembers(groupId).should.include(u2.id);
    const op = {
      'v': 6,
      'name': 'Add Admin',
      'id': u1.id,
      'admin': u2.id,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    groupsColl.document(groupId).admins.should.include(u2.id);
  });

  it('admins should be able "Update Group" to edit name and photo for groups', function () {
    const newUrl = 'http://url.com/newDummyUrl';
    const timestamp = Date.now();
    const groupId = db.userMemberships(u2.id)[0].id;
    const op = {
      'v': 6,
      'name': 'Update Group',
      'id': u2.id,
      'url': newUrl,
      'group': groupId,
      timestamp,
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    groupsColl.document(groupId).url.should.equal(newUrl);
  });

  it("should not be able to make a recovery connection when the other side connection is not equal to 'recovery' or 'already known'", function () {
    const timestamp = Date.now();

    let op = {
      'v': 6,
      'name': 'Connect',
      'id1': u1.id,
      'id2': u2.id,
      'level': 'recovery',
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp = apply(op);
    resp.json.result.errorNum.should.equal(errors.INELIGIBLE_RECOVERY_CONNECTION);
    connectionsColl.firstExample({
      '_from': 'users/' + u1.id,
      '_to': 'users/' + u2.id,
    }).level.should.equal('just met');
  });

  it('should be able to "Social Recovery"', function () {
    connect(u2, u1, 'already known');
    connect(u3, u1, 'already known');
    connect(u1, u2, 'recovery');
    connect(u1, u3, 'recovery');
    const timestamp = Date.now();
    const op = {
      'v': 6,
      'name': 'Social Recovery',
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
    op.sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u3.secretKey))
    );
    apply(op);
    db.loadUser(u1.id).signingKeys.should.deep.equal([u4.signingKey]);
    u1.secretKey = u4.secretKey;
  });

  it('should be able to "Add Signing Key"', function () {
    const addSigningKey = (u, signingKey) => {
      const timestamp = Date.now();
      const op = {
        'v': 6,
        'id': u.id,
        'name': 'Add Signing Key',
        signingKey,
        timestamp
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
      );
      apply(op);
    }
    addSigningKey(u2, u5.signingKey);
    addSigningKey(u2, u6.signingKey);
    db.loadUser(u2.id).signingKeys.should.deep.equal([u2.signingKey, u5.signingKey, u6.signingKey]);
  });

  it('should be able to "Remove Signing Key"', function () {
    const timestamp = Date.now();
    const op = {
      'v': 6,
      'id': u2.id,
      'name': 'Remove Signing Key',
      'signingKey': u5.signingKey,
      timestamp
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    db.loadUser(u2.id).signingKeys.should.deep.equal([u2.signingKey, u6.signingKey]);
  });

  it('should be able to sign an operation using new Signing Key', function () {
    const timestamp = Date.now();
    let op = {
      'v': 6,
      'name': 'Connect',
      'id1': u2.id,
      'id2': u3.id,
      'level': 'reported',
      'reportReason': 'duplicate',
      timestamp,
    }
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u6.secretKey))
    );
    apply(op);
    db.userConnections(u2.id).filter(
      u => u.id == u3.id
    )[0].level.should.equal('reported');
  });

  it('should be able to "Remove All Signing Keys"', function () {
    const timestamp = Date.now();
    const op = {
      'v': 6,
      'id': u2.id,
      'name': 'Remove All Signing Keys',
      timestamp
    }
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u6.secretKey))
    );
    apply(op);
    db.loadUser(u2.id).signingKeys.should.deep.equal([u6.signingKey]);
  });

  describe('family groups', function() {
    before(function() {
      usersColl.truncate();
      connectionsColl.truncate();
      groupsColl.truncate();
      usersInGroupsColl.truncate();
      invitationsColl.truncate();

      connect(u7, u8, 'already known');
      connect(u8, u7, 'already known');

      connect(u7, u9, 'already known');
      connect(u9, u7, 'already known');

      connect(u8, u9, 'already known');
      connect(u9, u8, 'already known');

      connect(u7, u10, 'already known');
      connect(u10, u7, 'already known');

      connect(u10, u9, 'already known');
      connect(u9, u10, 'already known');

      connect(u8, u10, 'already known');
      connect(u10, u8, 'already known');

      connect(u11, u8, 'already known');
      connect(u8, u11, 'already known');
    });

    it('should be able to create a family group by "Add Group"', function() {
      const timestamp = Date.now();
      const type = 'family';
      const url = 'http://url.com/dummy';
      const groupId = hash('randomstr1');
      const op = {
        'v': 6,
        'name': 'Add Group',
        'group': groupId,
        'id1': u7.id,
        url,
        type,
        timestamp,
      }
      const message = getMessage(op);
      op.sig1 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u7.secretKey))
      );
      apply(op);

      const group = groupsColl.document(groupId);
      group.type.should.equal('family');
      group.head.should.equal(u7.id);
      group.admins.should.include(u7.id);
    });

    it('admins should be able to "Invite" eligible users to the family group', function() {
      const timestamp = Date.now();
      const groupId = hash('randomstr1');
      const data = 'some data';
      const op = {
        'v': 6,
        'name': 'Invite',
        'inviter': u7.id,
        'invitee': u8.id,
        'group': groupId,
        data,
        timestamp,
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u7.secretKey))
      );
      apply(op);
      invitationsColl.byExample({
        '_from': 'users/' + u8.id,
        '_to': 'groups/' + groupId
      }).count().should.equal(1);
    });

    it('eligible users should be able to "Add Membership" to the family group', function() {
      const timestamp = Date.now();
      const groupId = hash('randomstr1');
      const op = {
        'v': 6,
        'name': 'Add Membership',
        'id': u8.id,
        'group': groupId,
        timestamp,
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u8.secretKey))
      );
      apply(op);
      const members = db.groupMembers(groupId);
      members.should.include(u8.id);
    });

    it('admins should not be able to "Invite" ineligible users to the family group', function() {
      const timestamp = Date.now();
      const groupId = hash('randomstr1');
      const data = 'some data';
      const op = {
        'v': 6,
        'name': 'Invite',
        'inviter': u7.id,
        'invitee': u11.id,
        'group': groupId,
        data,
        timestamp,
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u7.secretKey))
      );
      const resp = apply(op);
      resp.json.result.errorNum.should.equal(errors.INELIGIBLE_FAMILY_GROUP_MEMBER);
    });

    it('eligible users should be able to vouch family groups by "Vouch Family Group"', function() {
      const timestamp = Date.now();
      const groupId = hash('randomstr1');
      db.userGroupsToVouch(u9.id).should.include(groupId);
      const op = {
        'v': 6,
        'name': 'Vouch Family Group',
        'group': groupId,
        'id': u9.id,
        timestamp,
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u9.secretKey))
      );
      apply(op);
      groupsColl.document(groupId).vouchers.should.include(u9.id);
      db.userGroupsToVouch(u9.id).should.not.include(groupId);
    });

    it('admins should be able to "Change Family Head" of the group', function() {
      const timestamp = Date.now();
      const groupId = hash('randomstr1');

      let group = groupsColl.document(groupId);
      group.head.should.equal(u7.id);

      const op = {
        'v': 6,
        'name': 'Change Family Head',
        'group': groupId,
        'id': u7.id,
        'head': u8.id,
        timestamp,
      }
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u7.secretKey))
      );
      apply(op);
      group = groupsColl.document(groupId);
      group.head.should.equal(u8.id)
    });

    it('after any changes (add/remove member or change head) in a family group all the vouchs will expired and eligible users can vouch again', function() {
      const groupId = hash('randomstr1');
      groupsColl.document(groupId).vouchers.should.deep.equal([]);
      db.userGroupsToVouch(u9.id).should.include(groupId);
    });

    it('head of a family group should not be able to be head of another family group', function() {
      const timestamp = Date.now();
      const type = 'family';
      const url = 'http://url.com/dummy';
      const groupId = hash('randomstr2');
      const op = {
        'v': 6,
        'name': 'Add Group',
        'group': groupId,
        'id1': u8.id,
        url,
        type,
        timestamp,
      }
      const message = getMessage(op);
      op.sig1 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u8.secretKey))
      );
      const resp = apply(op);
      resp.json.result.errorNum.should.equal(errors.ALREADY_IS_FAMILY_GROUP_HEAD);
    });

    it('member of a family group should not be able to join another family group as member', function() {
      let timestamp = Date.now();
      const type = 'family';
      const url = 'http://url.com/dummy';
      const groupId = hash('randomstr3');
      let op = {
        'v': 6,
        'name': 'Add Group',
        'group': groupId,
        'id1': u9.id,
        url,
        type,
        timestamp,
      }
      let message = getMessage(op);
      op.sig1 = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u9.secretKey))
      );
      apply(op);

      timestamp = Date.now();
      const data = 'some data';
      op = {
        'v': 6,
        'name': 'Invite',
        'inviter': u9.id,
        'invitee': u7.id,
        'group': groupId,
        data,
        timestamp,
      }
      message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u9.secretKey))
      );
      const resp = apply(op);
      resp.json.result.errorNum.should.equal(errors.ALREADY_IS_FAMILY_GROUP_MEMBER);
    });

    it('head of a family group should be able to join another family group as a member', function() {
      let timestamp = Date.now();
      const groupId = hash('randomstr3');
      const data = 'some data';
      let op = {
        'v': 6,
        'name': 'Invite',
        'inviter': u9.id,
        'invitee': u8.id,
        'group': groupId,
        data,
        timestamp,
      }
      let message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u9.secretKey))
      );
      apply(op);

      timestamp = Date.now();
      op = {
        'v': 6,
        'name': 'Add Membership',
        'id': u8.id,
        'group': groupId,
        timestamp,
      }
      message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u8.secretKey))
      );
      apply(op);
      let members = db.groupMembers(groupId);
      members.should.include(u8.id);
      const group1 = groupsColl.document(hash('randomstr1'));
      group1.head.should.equal(u8.id);
    });
  });
});
