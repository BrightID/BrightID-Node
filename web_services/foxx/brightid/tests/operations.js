"use strict";

const secp256k1 = require("secp256k1");
const createKeccakHash = require("keccak");
const db = require("../db.js");
const errors = require("../errors.js");
const _ = require("lodash");
const { getMessage } = require("../operations");
const arango = require("@arangodb").db;
const query = require("@arangodb").query;
const request = require("@arangodb/request");
const nacl = require("tweetnacl");
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
  pad32,
  addressToBytes32,
} = require("../encoding");

const { baseUrl } = module.context;
const applyBaseUrl = baseUrl.replace("/brightid5", "/apply5");

let hashes;
let contextIdsColl, contextIdsColl2;
const connectionsColl = arango._collection("connections");
const groupsColl = arango._collection("groups");
const usersInGroupsColl = arango._collection("usersInGroups");
const usersColl = arango._collection("users");
const operationsColl = arango._collection("operations");
const contextsColl = arango._collection("contexts");
const appsColl = arango._collection("apps");
const sponsorshipsColl = arango._collection("sponsorships");
const operationsHashesColl = arango._collection("operationsHashes");
const invitationsColl = arango._collection("invitations");
const verificationsColl = arango._collection("verifications");
const variablesColl = arango._collection("variables");

const chai = require("chai");
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const u4 = nacl.sign.keyPair();
const u5 = nacl.sign.keyPair();
const u6 = nacl.sign.keyPair();

let { publicKey: sponsorPublicKey, secretKey: sponsorPrivateKey } =
  nacl.sign.keyPair();
let { secretKey: linkAESKey } = nacl.sign.keyPair();

const contextId = "0x636D49c1D76ff8E04767C68fe75eC9900719464b".toLowerCase();
const contextName = "ethereum";
const app = "ethereum";

const soulboundContextName = "soulboundToken";
const soulboundApp = "soulboundToken";

const soulboundMessage = "it's a test message.";

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

describe("operations", function () {
  before(function () {
    contextIdsColl = arango._collection(contextName);
    if (contextIdsColl) {
      contextIdsColl.truncate();
    } else {
      contextIdsColl = arango._create(contextName);
    }
    contextIdsColl2 = arango._collection(soulboundContextName);
    if (contextIdsColl2) {
      contextIdsColl2.truncate();
    } else {
      contextIdsColl2 = arango._create(soulboundContextName);
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
    [u1, u2, u3, u4, u5, u6].map((u) => {
      u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
      u.id = b64ToUrlSafeB64(u.signingKey);
      db.createUser(u.id, Date.now());
    });
    contextsColl.insert({
      _key: contextName,
      collection: contextName,
      linkAESKey: uInt8ArrayToB64(Object.values(linkAESKey)),
      idsAsHex: true,
    });
    appsColl.insert({
      _key: app,
      context: contextName,
      totalSponsorships: 5,
      verification: "BrightID",
      idsAsHex: true,
      sponsorPublicKey: uInt8ArrayToB64(Object.values(sponsorPublicKey)),
    });
    contextsColl.insert({
      _key: soulboundContextName,
      collection: soulboundContextName,
      soulboundMessage,
      linkAESKey: uInt8ArrayToB64(Object.values(linkAESKey)),
      soulbound: true,
    });
    appsColl.insert({
      _key: soulboundApp,
      context: soulboundContextName,
      totalSponsorships: 1,
      verification: "BrightID",
      soulbound: true,
      sponsorPublicKey: uInt8ArrayToB64(Object.values(sponsorPublicKey)),
    });
    verificationsColl.insert({
      name: "BrightID",
      user: u1.id,
    });
    verificationsColl.insert({
      name: "BrightID",
      user: u3.id,
    });
    verificationsColl.insert({
      name: "SeedConnected",
      user: u1.id,
      rank: 3,
    });
    hashes = variablesColl.document("VERIFICATIONS_HASHES").hashes;
    variablesColl.update("VERIFICATIONS_HASHES", { hashes: "{}" });
  });

  after(function () {
    operationsHashesColl.truncate();
    contextsColl.truncate();
    appsColl.truncate();
    arango._drop(contextIdsColl);
    arango._drop(contextIdsColl2);
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    sponsorshipsColl.truncate();
    invitationsColl.truncate();
    verificationsColl.truncate();
    variablesColl.update("VERIFICATIONS_HASHES", { hashes });
  });

  it('should be able to "Add Connection"', function () {
    const connect = (u1, u2) => {
      const timestamp = Date.now();
      let op = {
        v: 5,
        name: "Add Connection",
        id1: u1.id,
        id2: u2.id,
        timestamp,
      };
      const message = getMessage(op);
      op.sig1 = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u1.secretKey)
        )
      );
      op.sig2 = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u2.secretKey)
        )
      );
      apply(op);
    };
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
    db.connect({ id1: u3.id, id2: u2.id, level: "already known" });
    const timestamp = Date.now();
    const reason = "duplicate";

    let op = {
      v: 5,
      name: "Remove Connection",
      id1: u2.id,
      id2: u3.id,
      reason,
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    connectionsColl
      .firstExample({
        _from: "users/" + u2.id,
        _to: "users/" + u3.id,
      })
      .reportReason.should.equal(reason);
    connectionsColl
      .firstExample({
        _from: "users/" + u3.id,
        _to: "users/" + u2.id,
      })
      .level.should.equal("already known");
  });

  it('should be able to "Add Group"', function () {
    const timestamp = Date.now();
    const type = "general";
    const url = "http://url.com/dummy";
    const groupId = hash("randomstr");

    const op = {
      v: 5,
      name: "Add Group",
      group: groupId,
      id1: u1.id,
      id2: u2.id,
      inviteData2: "data",
      id3: u3.id,
      inviteData3: "data",
      url,
      type,
      timestamp,
    };
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
        v: 5,
        name: "Add Membership",
        id: u.id,
        group: groupId,
        timestamp,
      };
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
      v: 5,
      name: "Remove Membership",
      id: u1.id,
      group: groupId,
      timestamp,
    };
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
    const data = "some data";
    const op = {
      v: 5,
      name: "Invite",
      inviter: u2.id,
      invitee: u4.id,
      group: groupId,
      data,
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    invitationsColl
      .byExample({
        _from: "users/" + u4.id,
        _to: "groups/" + groupId,
      })
      .count()
      .should.equal(1);
  });

  it('admins should be able to "Dismiss" someone from the group', function () {
    const timestamp = Date.now();
    const groupId = db.userGroups(u2.id)[0].id;
    db.addMembership(groupId, u4.id, Date.now());
    db.groupMembers(groupId).should.include(u4.id);
    const op = {
      v: 5,
      name: "Dismiss",
      dismisser: u2.id,
      dismissee: u4.id,
      group: groupId,
      timestamp,
    };
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
    db.invite(u2.id, u4.id, groupId, "data", Date.now());
    db.addMembership(groupId, u4.id, Date.now());
    db.groupMembers(groupId).should.include(u4.id);
    const op = {
      v: 5,
      name: "Add Admin",
      id: u2.id,
      admin: u4.id,
      group: groupId,
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    apply(op);
    groupsColl.document(groupId).admins.should.include(u4.id);
  });

  it('admins should be able "Update Group" to edit name and photo for groups', function () {
    const newUrl = "http://url.com/newDummyUrl";
    const timestamp = Date.now();
    const groupId = db.userGroups(u2.id)[0].id;
    const op = {
      v: 5,
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
      v: 5,
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

  it('should be able to "Set Trusted Connections"', function () {
    db.connect({ id1: u2.id, id2: u1.id, level: "already known" });
    db.connect({ id1: u3.id, id2: u1.id, level: "already known" });
    const timestamp = Date.now();
    const op = {
      v: 5,
      name: "Set Trusted Connections",
      id: u1.id,
      trusted: [u2.id, u3.id],
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    apply(op);

    connectionsColl
      .firstExample({
        _from: "users/" + u1.id,
        _to: "users/" + u2.id,
      })
      .level.should.equal("recovery");
    connectionsColl
      .firstExample({
        _from: "users/" + u1.id,
        _to: "users/" + u3.id,
      })
      .level.should.equal("recovery");
  });

  it('should be able to "Set Signing Key"', function () {
    const timestamp = Date.now();
    const op = {
      v: 5,
      name: "Set Signing Key",
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
    db.loadUser(u1.id).signingKeys.should.deep.equal([u4.signingKey]);
    u1.secretKey = u4.secretKey;
  });

  it('should be able to "Link ContextId"', function () {
    const timestamp = Date.now();
    const op = {
      v: 5,
      name: "Link ContextId",
      context: contextName,
      timestamp,
      id: u1.id,
      contextId,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u4.secretKey))
    );
    apply(op);
    db.getContextIdsByUser(contextIdsColl, u1.id)[0].should.equal(contextId);
  });

  it("should be able to linking with Ethereum-signed messages for the soulbound apps", function () {
    const exampleSig = {
      address: "0xcc15be495d8c8996eefdfc78b2b23ba2fa92d67b",
      msg: "0x6974277320612074657374206d6573736167652e",
      sig: "e79413f9425cef5771d73321554f96483ef491e7579e85e518fcf84e0948646c393f9afed2de78fa22bf32b0fa4c66cec4d441b90c380f4f67bf8395a551e1111c",
    };

    const timestamp = Date.now();
    const op = {
      v: 5,
      name: "Link ContextId",
      context: soulboundContextName,
      timestamp,
      id: u3.id,
      contextId: exampleSig.sig,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u3.secretKey))
    );
    const res = apply(op);
    db.getContextIdsByUser(contextIdsColl2, u3.id)[0].should.equal(
      exampleSig.address
    );
    let resp = request.get(
      `${baseUrl}/verifications/${soulboundApp}/${exampleSig.address}`,
      {
        qs: {
          signed: "nacl",
        },
        json: true,
      }
    );
    resp.status.should.equal(200);
    resp.json.data.unique.should.equal(true);
  });

  it('should be able to "Connect"', function () {
    const timestamp = Date.now();

    let op = {
      v: 5,
      name: "Connect",
      id1: u1.id,
      id2: u2.id,
      level: "just met",
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
      .level.should.equal("just met");
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
      v: 5,
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

  it('should be able to "Add Signing Key"', function () {
    const addSigningKey = (u, signingKey) => {
      const timestamp = Date.now();
      const op = {
        v: 5,
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
    db.loadUser(u2.id).signingKeys.should.deep.equal([
      u2.signingKey,
      u5.signingKey,
      u6.signingKey,
    ]);
  });

  it('should be able to "Remove Signing Key"', function () {
    const timestamp = Date.now();
    const op = {
      v: 5,
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
    db.loadUser(u2.id).signingKeys.should.deep.equal([
      u2.signingKey,
      u6.signingKey,
    ]);
  });

  it("should be able to sign an operation using new Signing Key", function () {
    const timestamp = Date.now();
    let op = {
      v: 5,
      name: "Connect",
      id1: u2.id,
      id2: u3.id,
      level: "recovery",
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u6.secretKey))
    );
    apply(op);
    db.userConnections(u2.id)
      .filter((u) => u.id == u3.id)[0]
      .level.should.equal("recovery");
  });

  it('should be able to "Remove All Signing Keys"', function () {
    const timestamp = Date.now();
    const op = {
      v: 5,
      id: u2.id,
      name: "Remove All Signing Keys",
      timestamp,
    };
    const message = getMessage(op);
    op.sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u6.secretKey))
    );
    apply(op);
    db.loadUser(u2.id).signingKeys.should.deep.equal([u6.signingKey]);
  });

  describe("Sponsoring and getting verification", function () {
    it('apps should be able to "Sponsor" first then clients "Spend Sponsorship"', function () {
      const contextId = "0x79aF508C9698076Bc1c2DfA224f7829e9768B11E";
      let op1 = {
        name: "Sponsor",
        contextId,
        app,
        timestamp: Date.now(),
        v: 5,
      };
      const message1 = getMessage(op1);
      op1.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message1), sponsorPrivateKey)
        )
      );
      const r = apply(op1);
      let resp1 = request.get(`${baseUrl}/sponsorships/${contextId}`);
      resp1.json.data.appHasAuthorized.should.equal(true);
      resp1.json.data.spendRequested.should.equal(false);

      let op2 = {
        name: "Sponsor",
        contextId: contextId.toLowerCase(),
        app,
        timestamp: Date.now(),
        v: 5,
      };
      const message2 = getMessage(op2);
      op2.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message2), sponsorPrivateKey)
        )
      );
      const opRes = apply(op2);
      opRes.json.result.errorNum.should.equal(errors.APP_AUTHORIZED_BEFORE);

      let op3 = {
        name: "Spend Sponsorship",
        contextId: contextId.toLowerCase(),
        app,
        timestamp: Date.now(),
        v: 5,
      };
      const r2 = apply(op3);
      let resp3 = request.get(`${baseUrl}/sponsorships/${contextId}`);
      resp3.json.data.appHasAuthorized.should.equal(true);
      resp3.json.data.spendRequested.should.equal(true);
    });

    it('clients should be able to "Spend Sponsorship" first then apps "Sponsor"', function () {
      const contextId = "0x79aF508C9698076Bc1c2DfA224f7829e9768B11D";
      let op1 = {
        name: "Spend Sponsorship",
        contextId,
        app,
        timestamp: Date.now(),
        v: 5,
      };
      apply(op1);
      let resp1 = request.get(`${baseUrl}/sponsorships/${contextId}`);
      resp1.json.data.spendRequested.should.equal(true);
      resp1.json.data.appHasAuthorized.should.equal(false);

      let op2 = {
        name: "Spend Sponsorship",
        contextId: contextId.toLowerCase(),
        app,
        timestamp: Date.now(),
        v: 5,
      };
      const opRes = apply(op2);
      opRes.json.result.errorNum.should.equal(errors.SPEND_REQUESTED_BEFORE);

      let op3 = {
        name: "Sponsor",
        contextId: contextId.toLowerCase(),
        app,
        timestamp: Date.now(),
        v: 5,
      };
      const message3 = getMessage(op3);
      op3.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message3), sponsorPrivateKey)
        )
      );
      apply(op3);
      let resp3 = request.get(
        `${baseUrl}/sponsorships/${contextId.toLowerCase()}`
      );
      resp3.json.data.appHasAuthorized.should.equal(true);
      resp3.json.data.spendRequested.should.equal(true);
    });

    it("return not sponsored for the unlinked and not sponsored contextid", function () {
      const contextId = "0x51E4093bb8DA34AdD694A152635bE8e38F4F1a29";
      let resp = request.get(
        `${baseUrl}/verifications/${app}/${contextId.toLowerCase()}`,
        {
          qs: {
            signed: "eth",
            timestamp: "seconds",
          },
          json: true,
        }
      );
      resp.json.errorNum.should.equal(errors.NOT_SPONSORED);
    });

    it("return contextid not found for the unlinked and sponsored contextid", function () {
      const contextId = "0x51E4093bb8DA34AdD694A152635bE8e38F4F1a29";
      let op = {
        name: "Sponsor",
        contextId: contextId.toLowerCase(),
        app,
        timestamp: Date.now(),
        v: 5,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), sponsorPrivateKey)
        )
      );
      apply(op);

      let resp = request.get(
        `${baseUrl}/verifications/${app}/${contextId.toLowerCase()}`,
        {
          qs: {
            signed: "eth",
            timestamp: "seconds",
          },
          json: true,
        }
      );
      resp.json.errorNum.should.equal(errors.CONTEXTID_NOT_FOUND);
    });

    it('when the client sends "Link ContextId", the app should be able to get verification (the client should check sponsorships status)', function () {
      const contextId = "0x51E4093bb8DA34AdD694A152635bE8e38F4F1a30";

      const op = {
        name: "Link ContextId",
        context: contextName,
        id: u1.id,
        contextId: contextId.toLowerCase(),
        timestamp: Date.now(),
        v: 5,
      };
      const message = getMessage(op);
      op.sig = uInt8ArrayToB64(
        Object.values(
          nacl.sign.detached(strToUint8Array(message), u1.secretKey)
        )
      );
      apply(op);
      let resp = request.get(
        `${baseUrl}/verifications/${app}/${contextId.toLowerCase()}`,
        {
          qs: {
            signed: "eth",
            timestamp: "seconds",
          },
          json: true,
        }
      );
      resp.json.data.unique.should.equal(true);
    });
  });

  describe("Checking verifications signatures", function () {
    it("nacl signature", function () {
      const contextId = "0x51E4093bb8DA34AdD694A152635bE8e38F4F1a30";

      let resp = request.get(
        `${baseUrl}/verifications/${app}/${contextId.toLowerCase()}`,
        {
          qs: {
            signed: "nacl",
          },
          json: true,
        }
      );
      resp.status.should.equal(200);
      resp.json.data.unique.should.equal(true);
      const message =
        resp.json.data.app + "," + resp.json.data.contextIds.join(",");
      nacl.sign.detached
        .verify(
          strToUint8Array(message),
          b64ToUint8Array(resp.json.data.sig),
          b64ToUint8Array(resp.json.data.publicKey)
        )
        .should.equal(true);
    });

    it("eth signature", function () {
      const contextId = "0x51E4093bb8DA34AdD694A152635bE8e38F4F1a30";

      let resp = request.get(
        `${baseUrl}/verifications/${app}/${contextId.toLowerCase()}`,
        {
          qs: {
            signed: "eth",
          },
          json: true,
        }
      );
      resp.status.should.equal(200);
      resp.json.data.unique.should.equal(true);

      let message =
        pad32(resp.json.data.app) +
        resp.json.data.contextIds.map(addressToBytes32).join("");
      message = Buffer.from(message, "binary").toString("hex");
      message = new Uint8Array(
        createKeccakHash("keccak256").update(message, "hex").digest()
      );

      let signature = resp.json.data.sig.r + resp.json.data.sig.s;
      signature = new Uint8Array(Buffer.from(signature, "hex"));

      const publicKey = new Uint8Array(
        Buffer.from(resp.json.data.publicKey, "hex")
      );

      secp256k1.ecdsaVerify(signature, message, publicKey).should.equal(true);
    });
  });
});
