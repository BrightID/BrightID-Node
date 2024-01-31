"use strict";

const db = require("../db.js");
const arango = require("@arangodb").db;
const nacl = require("tweetnacl");
nacl.setPRNG(function (x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});

const {
  b64ToUrlSafeB64,
  uInt8ArrayToB64,
} = require("../encoding");

const usersColl = arango._collection("users");
const appsColl = arango._collection("apps");
const sponsorshipsColl = arango._collection("sponsorships");
const verificationsColl = arango._collection("verifications");
const variablesColl = arango._collection("variables");
const contextsColl = arango._collection("contexts");


const chai = require("chai");
const should = chai.should();

const u1 = nacl.sign.keyPair();
const u2 = nacl.sign.keyPair();

const contextName = "testapp";
const app = "testapp";

let { publicKey: sponsorPublicKey, secretKey: sponsorPrivateKey } =
  nacl.sign.keyPair();
let { secretKey: linkAESKey } = nacl.sign.keyPair();

describe("New sponsorship routine", function () {
  before(function () {
    usersColl.truncate();
    appsColl.truncate();
    sponsorshipsColl.truncate();
    verificationsColl.truncate();
    contextsColl.truncate();

    [u1, u2].forEach((u) => {
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
      verification: "meets.rank>1 and bitu.score>2",
      idsAsHex: true,
      sponsorPublicKey: uInt8ArrayToB64(Object.values(sponsorPublicKey)),
    });

    const hashes = JSON.parse(
      variablesColl.document("VERIFICATIONS_HASHES").hashes
    );
    const block = Math.max(...Object.keys(hashes));

    verificationsColl.insert({
      name: "bitu",
      user: u1.id,
      score: 3,
      block,
    });

    verificationsColl.insert({
      name: "meets",
      user: u1.id,
      rank: 2,
      block,
    });

    verificationsColl.insert({
      name: "meets",
      user: u2.id,
      rank: 2,
      block,
    });

  });
  after(function () {
    usersColl.truncate();
    appsColl.truncate();
    sponsorshipsColl.truncate();
    verificationsColl.truncate();
    variablesColl.truncate();
    contextsColl.truncate();

  });

  describe("Unit tests", function () {
    describe("db.isVerifiedFor", function () {
      it("should return true for the expected expr", function () {
        const sampleExpr = `meets.rank>1 and bitu.score>2`;
        db.isVerifiedFor(u1.id, sampleExpr).should.equal(true);
      });
      it("should return false for the expected expr", function () {
        const sampleExpr = `meets.rank>1 and bitu.score>3`;
        db.isVerifiedFor(u1.id, sampleExpr).should.equal(false);
      });
      it("should return false for the expected expr", function () {
        const sampleExpr = `meets.rank>1 and bitu.score>2`;
        db.isVerifiedFor(u2.id, sampleExpr).should.equal(false);
      });
    });
    describe('db.sponor', function () {
      it("should accept new sponsor operations", function () {
        const operation = {
          id: u1.id,
          app: app,
          timestamp: Date.now(),
        }
        db.sponsor(operation);
      });
      it("should reject sponsor operation with verification error", function () {
        const operation = {
          id: u2.id,
          app: app,
          timestamp: Date.now(),
        }
        try {
          db.sponsor(operation);
          throw new Error("should not reach here");
        } catch (e) {
          e.errorNum.should.equal(3);
        }

      });
      it("should reject sponsor operation with already sponsored error", function () {
        const operation = {
          id: u1.id,
          app: app,
          timestamp: Date.now(),
        }
        try {
          db.sponsor(operation);
          throw new Error("should not reach here");
        } catch (e) {
          e.errorNum.should.equal(39);
        }
      });
    });


  });



});
