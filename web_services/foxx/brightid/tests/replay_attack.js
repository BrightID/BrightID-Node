"use strict";

const stringify = require("fast-json-stable-stringify");
const arango = require("@arangodb").db;
const { getMessage } = require("../operations");
const errors = require("../errors");
const request = require("@arangodb/request");
const nacl = require("tweetnacl");
nacl.setPRNG(function (x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});
const {
  strToUint8Array,
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  hash,
} = require("../encoding");
const db = require("../db.js");

const { baseUrl } = module.context;
const applyBaseUrl = baseUrl.replace("/brightid6", "/apply6");

const connectionsColl = arango._collection("connections");
const groupsColl = arango._collection("groups");
const usersInGroupsColl = arango._collection("usersInGroups");
const usersColl = arango._collection("users");
const operationsColl = arango._collection("operations");

const chai = require("chai");
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
[u1, u2, u3].map((u) => {
  u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
  u.id = b64ToUrlSafeB64(u.signingKey);
});

describe("replay attack on operations", function () {
  before(function () {
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
    db.createUser(u1.id, u1.signingKey);
    db.createUser(u2.id, u2.signingKey);
    db.createUser(u3.id, u3.signingKey);
  });
  after(function () {
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    operationsColl.truncate();
  });

  it("should not be able to add an operation twice", function () {
    const timestamp = Date.now();
    let op = {
      name: "Connect",
      id1: u1.id,
      id2: u2.id,
      level: "already known",
      timestamp,
      v: 6,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp1 = request.post(`${baseUrl}/operations`, {
      body: op,
      json: true,
    });
    resp1.status.should.equal(200);
    const h = hash(message);
    resp1.json.data.hash.should.equal(h);

    op = operationsColl.document(h);
    delete op._rev;
    delete op._id;
    delete op._key;
    delete op.hash;
    delete op.state;
    op.blockTime = op.timestamp;
    const resp2 = request.put(`${applyBaseUrl}/operations/${h}`, {
      body: op,
      json: true,
    });
    resp2.json.success.should.equal(true);
    resp2.json.state.should.equal("applied");
    delete op.blockTime;

    const resp3 = request.post(`${baseUrl}/operations`, {
      body: op,
      json: true,
    });
    resp3.status.should.equal(403);
    resp3.json.errorNum.should.equal(errors.OPERATION_APPLIED_BEFORE);
    op.blockTime = op.timestamp;

    const resp4 = request.put(`${applyBaseUrl}/operations/${h}`, {
      body: op,
      json: true,
    });
    resp4.json.result.errorNum.should.equal(errors.OPERATION_APPLIED_BEFORE);
  });
});
