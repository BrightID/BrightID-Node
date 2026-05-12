"use strict";

const db = require("../db.js");
const _ = require("lodash");
const { getMessage } = require("../operations");
const errors = require("../errors");
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
  hash,
} = require("../encoding");
const chai = require("chai");

const { baseUrl } = module.context;
const applyBaseUrl = baseUrl.replace("/brightid6", "/apply6");

const usersColl = arango._collection("users");
const operationsColl = arango._collection("operations");

const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();
const u3 = nacl.sign.keyPair();
const u4 = nacl.sign.keyPair();

let { publicKey: sponsorPublicKey, secretKey: sponsorPrivateKey } =
  nacl.sign.keyPair();
let { secretKey: linkAESKey } = nacl.sign.keyPair();

function apply(op) {
  let resp = request.post(`${baseUrl}/operations`, {
    body: op,
    json: true,
  });
  if (resp.status != 200) {
    return resp;
  }
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
  if ((resp.state = "failed")) {
    return resp;
  }
}

describe("errors", function () {
  before(function () {
    usersColl.truncate();
    operationsColl.truncate();
    [u1, u2, u3, u4].map((u) => {
      u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
      u.id = b64ToUrlSafeB64(u.signingKey);
      db.createUser(u.id, Date.now());
    });
  });

  after(function () {
    usersColl.truncate();
    operationsColl.truncate();
  });

  it("should throw INVALID_SIGNATURE when operation signed by wrong user", function () {
    const timestamp = Date.now();
    let op = {
      v: 6,
      name: "Connect",
      id1: u2.id,
      id2: u1.id,
      level: "already known",
      timestamp,
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u1.secretKey))
    );
    const resp = apply(op);
    resp.json.code.should.equal(401);
    resp.json.errorNum.should.equal(errors.INVALID_SIGNATURE);
  });

  it("should throw OperationNotFoundError when the operation does not exist", function () {
    const hash = "testHash";
    const resp = request.get(`${baseUrl}/operations/${hash}`);
    resp.json.code.should.equal(404);
    resp.json.errorNum.should.equal(errors.OPERATION_NOT_FOUND);
    resp.json.errorMessage.should.equal(`The operation ${hash} is not found.`);
  });

  it("should throw UserNotFoundError when the user does not exist", function () {
    const id = "testId";
    const resp = request.get(`${baseUrl}/users/${id}/profile/dummy`);
    resp.json.code.should.equal(404);
    resp.json.errorNum.should.equal(errors.USER_NOT_FOUND);
    resp.json.errorMessage.should.equal(`The user ${id} is not found.`);
  });

  it("should not be able to 'Social Recovery' when the signers' recovery connection set less than 7 days ago", function () {
    db.connect({
      id1: u2.id,
      id2: u1.id,
      level: "already known",
      timestamp: 1,
    });
    db.connect({ id1: u1.id, id2: u2.id, level: "recovery", timestamp: 1 });
    db.connect({
      id1: u3.id,
      id2: u1.id,
      level: "already known",
      timestamp: 1,
    });
    db.connect({ id1: u1.id, id2: u3.id, level: "recovery", timestamp: 1 });
    db.connect({
      id1: u4.id,
      id2: u1.id,
      level: "already known",
      timestamp: Date.now(),
    });
    db.connect({
      id1: u1.id,
      id2: u4.id,
      level: "recovery",
      timestamp: Date.now(),
    });

    const op = {
      v: 6,
      name: "Social Recovery",
      id: u1.id,
      id1: u2.id,
      id2: u4.id,
      signingKey: u4.signingKey,
      timestamp: Date.now(),
    };
    const message = getMessage(op);
    op.sig1 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u2.secretKey))
    );
    op.sig2 = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(message), u3.secretKey))
    );
    apply(op);
    const resp = apply(op);
    resp.json.code.should.equal(403);
    resp.json.errorNum.should.equal(errors.WAIT_FOR_COOLDOWN);
  });
});
