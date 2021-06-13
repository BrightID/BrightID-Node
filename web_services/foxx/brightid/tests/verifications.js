"use strict";

const stringify = require('fast-json-stable-stringify');
const arango = require('@arangodb').db;
const request = require("@arangodb/request");
const errors = require('../errors.js');
const WISchnorrClient = require('../WISchnorrClient');
const db = require('../db');
const {
  b64ToUrlSafeB64,
  uInt8ArrayToB64,
  strToUint8Array
} = require('../encoding');
const chai = require('chai');
const nacl = require('tweetnacl');
nacl.setPRNG(function(x, n) {
  for (let i = 0; i < n; i++) {
    x[i] = Math.floor(Math.random() * 256);
  }
});

const should = chai.should();
const { baseUrl } = module.context;

const usersColl = arango._collection('users');
const appsColl = arango._collection('apps');
const variablesColl = arango._collection('variables');
const sponsorshipsColl = arango._collection('sponsorships');
const verificationsColl = arango._collection('verifications');
const cachedParamsColl = arango._collection('cachedParams');
const appIdsColl = arango._collection('appIds');

const u1 = nacl.sign.keyPair();
u1.signingKey = uInt8ArrayToB64(Object.values(u1.publicKey));
u1.id = b64ToUrlSafeB64(u1.signingKey);

const u2 = nacl.sign.keyPair();
u2.signingKey = uInt8ArrayToB64(Object.values(u2.publicKey));
u2.id = b64ToUrlSafeB64(u2.signingKey);

const verificationExpirationLength = 1000000;
const info = {
  app: 'idchain',
  roundedTimestamp: parseInt(Date.now() / verificationExpirationLength) * verificationExpirationLength,
  verification: 'BrightID'
};

describe('verifications', function() {
  before(function() {
    usersColl.truncate();
    appsColl.truncate();
    variablesColl.truncate();
    sponsorshipsColl.truncate();
    cachedParamsColl.truncate();
    appIdsColl.truncate();
    db.createUser(u1.id, 0);
    db.createUser(u2.id, 0);
    appsColl.insert({
      _key: info.app,
      verificationExpirationLength,
      idsAsHex: true
    });
    variablesColl.insert({
      _key: 'LAST_BLOCK',
      value: 0,
    });
    variablesColl.insert({
      _key: 'VERIFICATION_BLOCK',
      value: 0,
    });
    variablesColl.insert({
      _key: 'VERIFICATIONS_HASHES',
      hashes: '[]',
    });
    sponsorshipsColl.insert({
      _from: `users/${u1.id}`,
      _to: `apps/${info.app}`,
    });
    verificationsColl.insert({
      user: u1.id,
      name: info.verification
    });
  });

  after(function() {
    usersColl.truncate();
    appsColl.truncate();
    variablesColl.truncate();
    sponsorshipsColl.truncate();
    cachedParamsColl.truncate();
    appIdsColl.truncate();
  });

  it('should not be able to get WI-Schnorr server response for unverified users', function() {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/verifications/blinded/public`, { qs: info });
    const pub = JSON.parse(resp.body).data.public;
    const uid = 'unblinded_uid_of_the_user2';
    const appId = '0x79af508c9698076bc1c2dfa224f7829e9768b11e';
    const challenge = client.GenerateWISchnorrClientChallenge(pub, stringify(info), uid);
    const s = stringify({ id: u2.id, public: pub });
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(s), u2.secretKey))
    );
    const qs = {
      public: stringify(pub),
      sig,
      e: challenge.e
    }
    resp = request.get(`${baseUrl}/verifications/blinded/sig/${u2.id}`, { qs });
    resp.json.errorNum.should.equal(errors.NOT_VERIFIED);
  });

  it('apps should not be able to get WI-Schnorr server response for unverified users', function() {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/verifications/blinded/public`, { qs: info });
    const pub = JSON.parse(resp.body).data.public;
    const uid = 'unblinded_uid_of_the_user2';
    const appId = '0x79af508c9698076bc1c2dfa224f7829e9768b11e';
    const challenge = client.GenerateWISchnorrClientChallenge(pub, stringify(info), uid);
    const s = stringify({ id: u2.id, public: pub });
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(s), u2.secretKey))
    );
    const qs = {
      public: stringify(pub),
      sig,
      e: challenge.e
    }
    resp = request.get(`${baseUrl}/verifications/blinded/sig/${u2.id}`, { qs });
    resp.json.errorNum.should.equal(errors.NOT_VERIFIED);
  });

  it('apps should be able to get a verification', function() {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/verifications/blinded/public`, { qs: info });
    const pub = JSON.parse(resp.body).data.public;
    const uid = 'unblinded_uid_of_the_user';
    const appId = '0xE8FB09228d1373f931007ca7894a08344B80901c';
    const challenge = client.GenerateWISchnorrClientChallenge(pub, stringify(info), uid);
    const s = stringify({ id: u1.id, public: pub });
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(s), u1.secretKey))
    );
    const qs = {
      public: stringify(pub),
      sig,
      e: challenge.e
    }
    resp = request.get(`${baseUrl}/verifications/blinded/sig/${u1.id}`, { qs });
    const { response } = JSON.parse(resp.body).data;
    const signature = client.GenerateWISchnorrBlindSignature(challenge.t, response);

    resp = request.post(`${baseUrl}/verifications/${info.app}/${appId}`, {
      body: {
        uid,
        sig: signature,
        verification: info.verification,
        roundedTimestamp: info.roundedTimestamp
      },
      json: true
    });
    resp.status.should.equal(204);

    resp = request.get(`${baseUrl}/verifications/${info.app}/${appId}`, {
      qs: {
        signed: 'eth',
        timestamp: 'seconds',
      },
      json: true
    });
    resp.status.should.equal(200);
  });

  it('should not be able get more than one signature per app in each expiration period', function() {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    let resp = request.get(`${baseUrl}/verifications/blinded/public`, { qs: info });
    const pub = JSON.parse(resp.body).data.public;
    const uid = 'unblinded_uid_of_the_user';
    const appId = '0xE8FB09228d1373f931007ca7894a08344B80901c';
    const challenge = client.GenerateWISchnorrClientChallenge(pub, stringify(info), uid);
    const s = stringify({ id: u1.id, public: pub });
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(s), u1.secretKey))
    );
    const qs = {
      public: stringify(pub),
      sig,
      e: challenge.e
    }
    resp = request.get(`${baseUrl}/verifications/blinded/sig/${u1.id}`, { qs });
    resp.json.errorNum.should.equal(errors.DUPLICATE_SIG_REQUEST_ERROR);
  });

  it('apps should be able to check an appId verification', function() {
    let appId = '0xE8FB09228d1373f931007ca7894a08344B80901c';
    let resp = request.get(`${baseUrl}/verifications/${info.app}/${appId}`, {
      qs: {
        signed: 'eth',
        timestamp: 'seconds',
      },
      json: true
    });
    resp.status.should.equal(200);

    appId = '0x79af508c9698076bc1c2dfa224f7829e9768b11e';
    resp = request.get(`${baseUrl}/verifications/${info.app}/${appId}`, {
      qs: {
        signed: 'eth',
        timestamp: 'seconds',
      },
      json: true
    });
    resp.status.should.equal(403);
    resp.json.errorNum.should.equal(errors.NOT_VERIFIED);
  });
});