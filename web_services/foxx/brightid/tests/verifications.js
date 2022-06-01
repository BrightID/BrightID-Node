"use strict";

const stringify = require("fast-json-stable-stringify");
const arango = require("@arangodb").db;
const request = require("@arangodb/request");
const errors = require("../errors.js");
const WISchnorrClient = require("../WISchnorrClient");
const db = require("../db");
const {
  b64ToUrlSafeB64,
  uInt8ArrayToB64,
  strToUint8Array,
  b64ToUint8Array,
} = require("../encoding");
const chai = require("chai");
const nacl = require("tweetnacl");
nacl.setPRNG(function (x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});

const should = chai.should();
const { baseUrl } = module.context;

const usersColl = arango._collection("users");
const appsColl = arango._collection("apps");
const variablesColl = arango._collection("variables");
const sponsorshipsColl = arango._collection("sponsorships");
const verificationsColl = arango._collection("verifications");
const cachedParamsColl = arango._collection("cachedParams");
const appIdsColl = arango._collection("appIds");

const u1 = nacl.sign.keyPair();
u1.signingKey = uInt8ArrayToB64(Object.values(u1.publicKey));
u1.id = b64ToUrlSafeB64(u1.signingKey);

const u2 = nacl.sign.keyPair();
u2.signingKey = uInt8ArrayToB64(Object.values(u2.publicKey));
u2.id = b64ToUrlSafeB64(u2.signingKey);

const verificationExpirationLength = 1000000;

const app = {
  _key: "idchain",
  verificationExpirationLength,
  verifications: ["BrightID", "SeedConnected", "SeedConnectedWithFriend"],
  usingBlindSig: true,
  idsAsHex: true,
};

let info;

describe("verifications", function () {
  before(function () {
    usersColl.truncate();
    appsColl.truncate();
    variablesColl.truncate();
    sponsorshipsColl.truncate();
    cachedParamsColl.truncate();
    appIdsColl.truncate();
    db.createUser(u1.id, 0);
    db.createUser(u2.id, 0);
    appsColl.insert(app);
    variablesColl.insert({
      _key: "LAST_BLOCK",
      value: 0,
    });
    variablesColl.insert({
      _key: "VERIFICATION_BLOCK",
      value: 0,
    });
    variablesColl.insert({
      _key: "VERIFICATIONS_HASHES",
      hashes: "[]",
    });
    sponsorshipsColl.insert({
      _from: `users/${u1.id}`,
      _to: `apps/${app._key}`,
    });
    verificationsColl.insert({
      user: u1.id,
      name: "BrightID",
    });
    verificationsColl.insert({
      name: "SeedConnected",
      user: u1.id,
      rank: 3,
    });
  });

  after(function () {
    usersColl.truncate();
    appsColl.truncate();
    variablesColl.truncate();
    sponsorshipsColl.truncate();
    cachedParamsColl.truncate();
    appIdsColl.truncate();
  });

  it("should not be able to get WI-Schnorr server response for unverified users", function () {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/apps/${app._key}`);
    const vel = resp.json.data.verificationExpirationLength;
    const verifications = resp.json.data.verifications;
    const appUserId = "0x79af508c9698076bc1c2dfa224f7829e9768b11e";

    for (const verification of verifications) {
      const info = {
        app: app._key,
        roundedTimestamp: parseInt(Date.now() / vel) * vel,
        verification,
      };
      resp = request.get(`${baseUrl}/verifications/blinded/public`, {
        qs: info,
      });
      const pub = JSON.parse(resp.body).data.public;
      const uid = Math.random().toString(36).substr(2, 10);
      const challenge = client.GenerateWISchnorrClientChallenge(
        pub,
        stringify(info),
        uid
      );
      const s = stringify({ id: u2.id, public: pub });
      const sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(s), u2.secretKey))
      );
      const qs = {
        public: stringify(pub),
        sig,
        e: challenge.e,
      };
      resp = request.get(`${baseUrl}/verifications/blinded/sig/${u2.id}`, {
        qs,
      });
      resp.json.errorNum.should.equal(errors.NOT_VERIFIED);
    }
  });

  it("if the user is verified, apps should be able to get a verification signature", function () {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/apps/${app._key}`);
    const vel = resp.json.data.verificationExpirationLength;
    const verifications = resp.json.data.verifications;
    const appUserId = "0xE8FB09228d1373f931007ca7894a08344B80901c";

    for (const verification of verifications) {
      const info = {
        app: app._key,
        roundedTimestamp: parseInt(Date.now() / vel) * vel,
        verification,
      };
      resp = request.get(`${baseUrl}/verifications/blinded/public`, {
        qs: info,
      });
      const pub = JSON.parse(resp.body).data.public;
      const uid = Math.random().toString(36).substr(2, 10);
      const challenge = client.GenerateWISchnorrClientChallenge(
        pub,
        stringify(info),
        uid
      );
      const s = stringify({ id: u1.id, public: pub });
      const sig = uInt8ArrayToB64(
        Object.values(nacl.sign.detached(strToUint8Array(s), u1.secretKey))
      );
      const qs = {
        public: stringify(pub),
        sig,
        e: challenge.e,
      };
      resp = request.get(`${baseUrl}/verifications/blinded/sig/${u1.id}`, {
        qs,
      });
      if (verification == "SeedConnectedWithFriend") {
        resp.json.errorNum.should.equal(errors.NOT_VERIFIED);
        continue;
      }
      const { response } = JSON.parse(resp.body).data;
      const signature = client.GenerateWISchnorrBlindSignature(
        challenge.t,
        response
      );

      resp = request.post(`${baseUrl}/verifications/${info.app}/${appUserId}`, {
        body: {
          uid,
          sig: signature,
          verification,
          roundedTimestamp: info.roundedTimestamp,
        },
        json: true,
      });
      resp.status.should.equal(204);
    }

    resp = request.get(`${baseUrl}/verifications/${app._key}/${appUserId}`, {
      qs: {
        signed: "eth",
        timestamp: "seconds",
      },
      json: true,
    });
    resp.status.should.equal(200);
    for (let v of resp.json.data) {
      Object.keys(v).should.include("verificationHash");
      if (v.verification == "SeedConnectedWithFriend") {
        v.unique.should.equal(false);
      } else {
        v.unique.should.equal(true);
      }
    }

    resp = request.get(
      `${baseUrl}/verifications/${app._key}/${appUserId.toLowerCase()}`,
      {
        qs: {
          signed: "nacl",
        },
        json: true,
      }
    );
    resp.status.should.equal(200);
    for (let v of resp.json.data) {
      Object.keys(v).should.include("verificationHash");
      if (v.verification == "SeedConnectedWithFriend") {
        v.unique.should.equal(false);
      } else {
        v.unique.should.equal(true);
        const message = v.app + "," + v.appUserId + "," + v.verificationHash;
        nacl.sign.detached
          .verify(
            strToUint8Array(message),
            b64ToUint8Array(v.sig),
            b64ToUint8Array(v.publicKey)
          )
          .should.equal(true);
      }
    }
  });

  it("should not be able get more than one signature per verification of the app in each expiration period", function () {
    const info = {
      app: app._key,
      roundedTimestamp:
        parseInt(Date.now() / verificationExpirationLength) *
        verificationExpirationLength,
      verification: "BrightID",
    };
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/verifications/blinded/public`, {
      qs: info,
    });
    const pub = JSON.parse(resp.body).data.public;
    const uid = "unblinded_uid_of_the_user1";
    const appUserId = "0xE8FB09228d1373f931007ca7894a08344B80901c";
    const challenge = client.GenerateWISchnorrClientChallenge(
      pub,
      stringify(info),
      uid
    );
    const s = stringify({ id: u1.id, public: pub });
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(s), u1.secretKey))
    );
    const qs = {
      public: stringify(pub),
      sig,
      e: challenge.e,
    };
    resp = request.get(`${baseUrl}/verifications/blinded/sig/${u1.id}`, { qs });
    resp.json.errorNum.should.equal(errors.DUPLICATE_SIG_REQUEST_ERROR);
  });

  it("apps should be able to check an appUserId verification", function () {
    let appUserId = "0xE8FB09228d1373f931007ca7894a08344B80901c";
    let resp = request.get(
      `${baseUrl}/verifications/${app._key}/${appUserId.toLowerCase()}`,
      {
        qs: {
          signed: "eth",
          timestamp: "seconds",
          includeHash: false,
        },
        json: true,
      }
    );
    resp.status.should.equal(200);
    for (let v of resp.json.data) {
      Object.keys(v).should.not.include("verificationHash");
      if (v.verification == "SeedConnectedWithFriend") {
        v.unique.should.equal(false);
      } else {
        v.unique.should.equal(true);
      }
    }

    appUserId = "0x79aF508C9698076Bc1c2DfA224f7829e9768B11C";
    resp = request.get(`${baseUrl}/verifications/${app._key}/${appUserId}`, {
      qs: {
        signed: "eth",
        timestamp: "seconds",
        includeHash: false,
      },
      json: true,
    });
    resp.status.should.equal(404);
    resp.json.errorNum.should.equal(errors.APP_ID_NOT_FOUND);
  });
});
