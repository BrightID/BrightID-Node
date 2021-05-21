"use strict";

const stringify = require('fast-json-stable-stringify');
const arango = require('@arangodb').db;
const request = require("@arangodb/request");
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

const u = nacl.sign.keyPair();
u.signingKey = uInt8ArrayToB64(Object.values(u.publicKey));
u.id = b64ToUrlSafeB64(u.signingKey);
const tp = 1000000;

describe('verifications', function() {
  before(function() {
    usersColl.truncate();
    appsColl.truncate();
    variablesColl.truncate();
    sponsorshipsColl.truncate();
    cachedParamsColl.truncate();
    db.createUser(u.id, 0);
    appsColl.insert({
      _key: 'idchain',
      timestampPrecision: tp
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
      _from: `users/${u.id}`,
      _to: 'apps/idchain',
    });
    verificationsColl.insert({
      user: u.id,
      name: 'BrightID' 
    });
  });

  after(function() {
    usersColl.truncate();
    appsColl.truncate();
    variablesColl.truncate();
    sponsorshipsColl.truncate();
    cachedParamsColl.truncate();
  });

  it('should be able to get blind signed verification', function() {
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    const info = {
      app: 'idchain',
      roundedTimestamp: parseInt(Date.now() / tp) * tp,
      verification: 'BrightID'  
    };
    let resp = request.get(`${baseUrl}/verifications/public`, { qs: info });
    const pub = JSON.parse(resp.body).data.public;
    const msg = "this is a message from the client";
    const challenge = client.GenerateWISchnorrClientChallenge(pub, stringify(info), msg);
    const s = stringify({ id: u.id, public: pub });
    const sig = uInt8ArrayToB64(
      Object.values(nacl.sign.detached(strToUint8Array(s), u.secretKey))
    );
    const qs = {
      public: stringify(pub),
      sig,
      e: challenge.e
    }
    resp = request.get(`${baseUrl}/verifications/${u.id}`, { qs });
    const { response } = JSON.parse(resp.body).data;
    const signature = client.GenerateWISchnorrBlindSignature(challenge.t, response);
    const verified = client.VerifyWISchnorrBlindSignature(signature, stringify(info), msg);
    verified.should.equal(true);
  });

});
