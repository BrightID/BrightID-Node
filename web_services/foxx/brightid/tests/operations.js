"use strict";

const db = require("../db.js");
const errors = require("../errors.js");
const _ = require("lodash");
const { getMessage } = require("../operations");
const arango = require("@arangodb").db;
const query = require("@arangodb").query;
const request = require("@arangodb/request");
const nacl = require("tweetnacl");
const NodeRSA = require("node-rsa");
const stringify = require("fast-json-stable-stringify");
const BlindSignature = require("../rsablind");

nacl.setPRNG(function (x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});
const {
  b64ToUrlSafeB64,
  uInt8ArrayToB64,
  strToUint8Array,
  b64ToUint8Array,
  hash,
} = require("../encoding");

const { baseUrl } = module.context;
const applyBaseUrl = baseUrl.replace("/brightid6", "/apply6");

const connectionsColl = arango._collection("connections");
const groupsColl = arango._collection("groups");
const usersInGroupsColl = arango._collection("usersInGroups");
const usersColl = arango._collection("users");
const operationsColl = arango._collection("operations");
const appsColl = arango._collection("apps");
const sponsorshipsColl = arango._collection("sponsorships");
const operationsHashesColl = arango._collection("operationsHashes");
const invitationsColl = arango._collection("invitations");
const verificationsColl = arango._collection("verifications");

const chai = require("chai");
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

let { publicKey: sponsorPublicKey, secretKey: sponsorPrivateKey } =
  nacl.sign.keyPair();

function apply(op) {
  let resp = request.post(`${baseUrl}/operations`, {
    body: op,
    json: true,
  });
  resp.status.should.equal(200);
  let h = hash(getMessage(op));
  resp.json.data.hash.should.equal(h);
  op = operationsColl.document(h);
  op = _.omit(op, ["_rev", "_id", "_key", "hash", "state"]);
  op.blockTime = op.timestamp;
  resp = request.put(`${applyBaseUrl}/operations/${h}`, {
    body: op,
    json: true,
  });
  resp.json.success.should.equal(true);
  return resp;
}

function connect(u1, u2, level) {
  const timestamp = Date.now();
  let op = {
    v: 6,
    name: "Connect",
    id1: u1.id,
    id2: u2.id,
    level,
    timestamp,
  };
  const message = getMessage(op);
  op.sig1 = uInt8ArrayToB64(
    Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
  );
  apply(op);
  connectionsColl
    .firstExample({
      _from: "users/" + u1.id,
      _to: "users/" + u2.id,
    })
    .level.should.equal(level);
}

describe("operations", function () {
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
      _key: "idchain",
      sponsorPublicKey: uInt8ArrayToB64(Object.values(sponsorPublicKey)),
      verificationExpirationLength: 1000000,
      totalSponsorships: 3,
      idsAsHex: true,
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
    connect(u1, u2, "just met");
    connect(u2, u1, "just met");
    connect(u1, u3, "just met");
    connect(u3, u1, "just met");
    connect(u2, u3, "just met");
    connect(u2, u4, "just met");
    connect(u3, u4, "just met");
  });

  it('should be able to report using "Connect" by providing requestProof', function () {
    const timestamp = Date.now();
    const requestProofMessage = u1.id + "|" + timestamp;
    const requestProof = uInt8ArrayToB64(
      Object.values(
        nacl.sign.detached(strToUint8Array(requestProofMessage), u1.secretKey)
      )
    );
    let op = {
      v: 6,
      name: "Connect",
      id1: u2.id,
      id2: u1.id,
      level: "reported",
      reportReason: "spammer",
      requestProof,
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    const conn = connectionsColl.firstExample({
      _from: "users/" + u2.id,
      _to: "users/" + u1.id,
    });
    conn.level.should.equal("reported");
    conn.requestProof.should.equal(requestProof);
  });

  it('should be able to "Add Group"', function () {
    const timestamp = Date.now();
    const type = "general";
    const url = "http://url.com/dummy";
    const groupId = hash("randomstr");

    const op = {
      v: 6,
      name: "Add Group",
      group: groupId,
      id: u1.id,
      url,
      type,
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);

    const members = db.groupMembers(groupId);
    members.should.include(u1.id);
  });

  it('should be able to "Add Membership"', function () {
    const groupId = db.userMemberships(u1.id)[0].id;
    const timestamp = Date.now();
    db.invite(u1.id, u2.id, groupId, "data", timestamp);
    const op = {
      v: 6,
      name: "Add Membership",
      id: u2.id,
      group: groupId,
      timestamp,
    };
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
      v: 6,
      name: "Remove Membership",
      id: u2.id,
      group: groupId,
      timestamp,
    };
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
    const data = "some data";
    const op = {
      v: 6,
      name: "Invite",
      inviter: u1.id,
      invitee: u2.id,
      group: groupId,
      data,
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    invitationsColl
      .byExample({
        _from: "users/" + u2.id,
        _to: "groups/" + groupId,
      })
      .count()
      .should.equal(1);
  });

  it('admins should be able to "Dismiss" someone from the group', function () {
    const timestamp = Date.now();
    const groupId = db.userMemberships(u1.id)[0].id;
    db.addMembership(groupId, u2.id, Date.now());
    db.groupMembers(groupId).should.include(u2.id);
    const op = {
      v: 6,
      name: "Dismiss",
      dismisser: u1.id,
      dismissee: u2.id,
      group: groupId,
      timestamp,
    };
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
    db.invite(u1.id, u2.id, groupId, "data", Date.now());
    db.addMembership(groupId, u2.id, Date.now());
    db.groupMembers(groupId).should.include(u2.id);
    const op = {
      v: 6,
      name: "Add Admin",
      id: u1.id,
      admin: u2.id,
      group: groupId,
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);
    groupsColl.document(groupId).admins.should.include(u2.id);
  });

  it('admins should be able "Update Group" to edit name and photo for groups', function () {
    const newUrl = "http://url.com/newDummyUrl";
    const timestamp = Date.now();
    const groupId = db.userMemberships(u2.id)[0].id;
    const op = {
      v: 6,
      name: "Update Group",
      id: u2.id,
      url: newUrl,
      group: groupId,
      timestamp,
    };
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
      v: 6,
      name: "Connect",
      id1: u1.id,
      id2: u2.id,
      level: "recovery",
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp = apply(op);
    resp.json.result.errorNum.should.equal(
      errors.INELIGIBLE_RECOVERY_CONNECTION
    );
    connectionsColl
      .firstExample({
        _from: "users/" + u1.id,
        _to: "users/" + u2.id,
      })
      .level.should.equal("just met");
  });

  it('should be able to "Social Recovery"', function () {
    connect(u2, u1, "already known");
    connect(u3, u1, "already known");
    connect(u1, u2, "recovery");
    connect(u1, u3, "recovery");
    const timestamp = Date.now();
    const op = {
      v: 6,
      name: "Social Recovery",
      id: u1.id,
      id1: u2.id,
      id2: u3.id,
      signingKey: u4.signingKey,
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    op.sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u3.secretKey))
    );
    apply(op);
    usersColl.document(u1.id).signingKeys.should.deep.equal([u4.signingKey]);
    u1.secretKey = u4.secretKey;
  });

  it('should be able to "Add Signing Key"', function () {
    const addSigningKey = (u, signingKey) => {
      const timestamp = Date.now();
      const op = {
        v: 6,
        id: u.id,
        name: "Add Signing Key",
        signingKey,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(message), u.secretKey))
      );
      apply(op);
    };
    addSigningKey(u2, u5.signingKey);
    addSigningKey(u2, u6.signingKey);
    usersColl
      .document(u2.id)
      .signingKeys.should.deep.equal([
        u2.signingKey,
        u5.signingKey,
        u6.signingKey,
      ]);
  });

  it('should be able to "Remove Signing Key"', function () {
    const timestamp = Date.now();
    const op = {
      v: 6,
      id: u2.id,
      name: "Remove Signing Key",
      signingKey: u5.signingKey,
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    usersColl
      .document(u2.id)
      .signingKeys.should.deep.equal([u2.signingKey, u6.signingKey]);
  });

  it("should be able to sign an operation using new Signing Key", function () {
    const timestamp = Date.now();
    let op = {
      v: 6,
      name: "Connect",
      id1: u2.id,
      id2: u3.id,
      level: "reported",
      reportReason: "duplicate",
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u6.secretKey))
    );
    apply(op);
    db.userConnections(u2.id)
      .filter((u) => u.id == u3.id)[0]
      .level.should.equal("reported");
  });

  it('should be able to "Remove All Signing Keys"', function () {
    const timestamp = Date.now();
    const op = {
      v: 6,
      id: u2.id,
      name: "Remove All Signing Keys",
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u6.secretKey))
    );
    apply(op);
    usersColl.document(u2.id).signingKeys.should.deep.equal([u6.signingKey]);
  });

  describe("family groups", function () {
    before(function () {
      usersColl.truncate();
      connectionsColl.truncate();
      groupsColl.truncate();
      usersInGroupsColl.truncate();
      invitationsColl.truncate();

      connect(u7, u8, "already known");
      connect(u8, u7, "already known");

      connect(u7, u9, "already known");
      connect(u9, u7, "already known");

      connect(u8, u9, "already known");
      connect(u9, u8, "already known");

      connect(u7, u10, "already known");
      connect(u10, u7, "already known");

      connect(u10, u9, "already known");
      connect(u9, u10, "already known");

      connect(u8, u10, "already known");
      connect(u10, u8, "already known");

      connect(u11, u8, "already known");
      connect(u8, u11, "already known");

      connect(u11, u10, "already known");
      connect(u10, u11, "already known");
    });

    it('should be able to create a family group by "Add Group"', function () {
      const timestamp = Date.now();
      const type = "family";
      const url = "http://url.com/dummy";
      const groupId = hash("randomstr1");
      const op = {
        v: 6,
        name: "Add Group",
        group: groupId,
        id: u7.id,
        url,
        type,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u7.secretKey)
        )
      );
      apply(op);

      const group = groupsColl.document(groupId);
      group.type.should.equal("family");
      group.admins.should.include(u7.id);
    });

    it('admins should be able to "Invite" eligible users to the family group', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr1");
      const data = "some data";
      const op = {
        v: 6,
        name: "Invite",
        inviter: u7.id,
        invitee: u8.id,
        group: groupId,
        data,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u7.secretKey)
        )
      );
      apply(op);
      invitationsColl
        .byExample({
          _from: "users/" + u8.id,
          _to: "groups/" + groupId,
        })
        .count()
        .should.equal(1);
    });

    it('eligible users should be able to "Add Membership" to the family group', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr1");
      const op = {
        v: 6,
        name: "Add Membership",
        id: u8.id,
        group: groupId,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u8.secretKey)
        )
      );
      apply(op);
      const members = db.groupMembers(groupId);
      members.should.include(u8.id);
    });

    it('admins should not be able to "Invite" ineligible users to the family group', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr1");
      const data = "some data";
      const op = {
        v: 6,
        name: "Invite",
        inviter: u7.id,
        invitee: u11.id,
        group: groupId,
        data,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u7.secretKey)
        )
      );
      const resp = apply(op);
      resp.json.result.errorNum.should.equal(errors.INELIGIBLE_FAMILY_MEMBER);
    });

    it('admins should be able to "Set Family Head" of the group', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr1");

      const op = {
        v: 6,
        name: "Set Family Head",
        group: groupId,
        id: u7.id,
        head: u7.id,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u7.secretKey)
        )
      );
      apply(op);
      const group = groupsColl.document(groupId);
      group.head.should.equal(u7.id);
    });

    it('eligible users should be able to vouch family groups by "Vouch Family"', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr1");
      db.userFamiliesToVouch(u9.id).should.include(groupId);
      const op = {
        v: 6,
        name: "Vouch Family",
        group: groupId,
        id: u9.id,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u9.secretKey)
        )
      );
      apply(op);
      groupsColl.document(groupId).vouchers.should.include(u9.id);
      db.userFamiliesToVouch(u9.id).should.not.include(groupId);
    });

    it('admins should be able to change head of family by "Set Family Head"', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr1");
      let group = groupsColl.document(groupId);
      group.head.should.equal(u7.id);

      const op = {
        v: 6,
        name: "Set Family Head",
        group: groupId,
        id: u7.id,
        head: u8.id,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u7.secretKey)
        )
      );
      apply(op);
      group = groupsColl.document(groupId);
      group.head.should.equal(u8.id);
    });

    it("after any changes (add/remove member or change head) in a family group all the vouchs will expired and eligible users can vouch again", function () {
      const groupId = hash("randomstr1");
      groupsColl.document(groupId).vouchers.should.deep.equal([]);
      db.userFamiliesToVouch(u9.id).should.include(groupId);
    });

    it("member of a family group should not be able to join another family group as member", function () {
      let timestamp = Date.now();
      const type = "family";
      const url = "http://url.com/dummy";
      const groupId = hash("randomstr3");
      let op = {
        v: 6,
        name: "Add Group",
        group: groupId,
        id: u9.id,
        url,
        type,
        timestamp,
      };
      let message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u9.secretKey)
        )
      );
      apply(op);

      timestamp = Date.now();
      const data = "some data";
      op = {
        v: 6,
        name: "Invite",
        inviter: u9.id,
        invitee: u7.id,
        group: groupId,
        data,
        timestamp,
      };
      message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u9.secretKey)
        )
      );
      const resp = apply(op);
      resp.json.result.errorNum.should.equal(errors.ALREADY_IS_FAMILY_MEMBER);
    });

    it("head of a family group should be able to join another family group as a member", function () {
      let timestamp = Date.now();
      const groupId = hash("randomstr3");
      const data = "some data";
      let op = {
        v: 6,
        name: "Invite",
        inviter: u9.id,
        invitee: u8.id,
        group: groupId,
        data,
        timestamp,
      };
      let message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u9.secretKey)
        )
      );
      apply(op);

      timestamp = Date.now();
      op = {
        v: 6,
        name: "Add Membership",
        id: u8.id,
        group: groupId,
        timestamp,
      };
      message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u8.secretKey)
        )
      );
      apply(op);
      let members = db.groupMembers(groupId);
      members.should.include(u8.id);
      const group1 = groupsColl.document(hash("randomstr1"));
      group1.head.should.equal(u8.id);
    });

    it('admins of an eligible general group should be able to "Convert To Family"', function () {
      const timestamp = Date.now();
      const groupId = hash("randomstr2");
      const url = "http://url.com/dummy";

      db.createGroup(groupId, u10.id, url, "general", Date.now());
      db.invite(u10.id, u11.id, groupId, "data", Date.now());
      db.addMembership(groupId, u11.id, Date.now());
      let group = db.getGroup(groupId);
      group.type.should.equal("general");

      const op = {
        v: 6,
        name: "Convert To Family",
        group: groupId,
        id: u10.id,
        head: u11.id,
        timestamp,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u10.secretKey)
        )
      );
      apply(op);
      group = groupsColl.document(groupId);
      group.type.should.equal("family");
      group.head.should.equal(u11.id);
    });
  });

  describe("Sponsoring users", function () {
    it('apps should be able to "Sponsor" first then clients "Spend Sponsorship"', function () {
      const appUserId = "0x79aF508C9698076Bc1c2DfA224f7829e9768B11E";
      let op1 = {
        name: "Sponsor",
        appUserId,
        app: "idchain",
        timestamp: Date.now(),
        v: 6,
      };
      op1.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(stringify(op1)), sponsorPrivateKey)
        )
      );
      apply(op1);
      let resp1 = request.get(`${baseUrl}/sponsorships/${appUserId}`);
      resp1.json.data.appHasAuthorized.should.equal(true);
      resp1.json.data.spendRequested.should.equal(false);

      let op2 = {
        name: "Sponsor",
        appUserId: appUserId.toLowerCase(),
        app: "idchain",
        timestamp: Date.now(),
        v: 6,
      };
      op2.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(stringify(op2)), sponsorPrivateKey)
        )
      );
      const opRes = apply(op2);
      opRes.json.result.errorNum.should.equal(errors.APP_AUTHORIZED_BEFORE);

      let op3 = {
        name: "Spend Sponsorship",
        appUserId: appUserId.toLowerCase(),
        app: "idchain",
        timestamp: Date.now(),
        v: 6,
      };
      apply(op3);
      let resp3 = request.get(`${baseUrl}/sponsorships/${appUserId}`);
      resp3.json.data.appHasAuthorized.should.equal(true);
      resp3.json.data.spendRequested.should.equal(true);
    });

    it('clients should be able to "Spend Sponsorship" first then apps "Sponsor"', function () {
      const appUserId = "0xE8FB09228d1373f931007ca7894a08344B80901c";
      let op1 = {
        name: "Spend Sponsorship",
        appUserId,
        app: "idchain",
        timestamp: Date.now(),
        v: 6,
      };
      apply(op1);
      let resp1 = request.get(`${baseUrl}/sponsorships/${appUserId}`);
      resp1.json.data.spendRequested.should.equal(true);
      resp1.json.data.appHasAuthorized.should.equal(false);

      let op2 = {
        name: "Spend Sponsorship",
        appUserId: appUserId.toLowerCase(),
        app: "idchain",
        timestamp: Date.now(),
        v: 6,
      };
      const opRes = apply(op2);
      opRes.json.result.errorNum.should.equal(errors.SPEND_REQUESTED_BEFORE);

      let op3 = {
        name: "Sponsor",
        appUserId: appUserId.toLowerCase(),
        app: "idchain",
        timestamp: Date.now(),
        v: 6,
      };
      op3.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(stringify(op3)), sponsorPrivateKey)
        )
      );
      apply(op3);
      let resp3 = request.get(
        `${baseUrl}/sponsorships/${appUserId.toLowerCase()}`
      );
      resp3.json.data.appHasAuthorized.should.equal(true);
      resp3.json.data.spendRequested.should.equal(true);
    });
  });
});
