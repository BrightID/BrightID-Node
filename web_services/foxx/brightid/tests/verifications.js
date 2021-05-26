"use strict";

const BigInteger = require('node-jsbn');
const stringify = require('fast-json-stable-stringify');
const arango = require('@arangodb').db;
const request = require("@arangodb/request");
const BlindSignature = require('../rsablind');
const NodeRSA = require('node-rsa');
const WISchnorrClient = require('../WISchnorrClient');
const { genRandomBytes } = require('@arangodb/crypto');
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
      keypair: { n: N, e: E },
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

  it('apps should be able to sponsor a user', function() {
    let op = {
      name: 'Sponsor',
      id: u.id,
      app: 'idchain',
      timestamp: Date.now(),
      v: 6
    }
    const message = stringify(op);
    const { blinded, r } = BlindSignature.blind({ message, N, E });
    const signed = BlindSignature.sign({ blinded, key });
    const unblinded = BlindSignature.unblind({ signed, N, r });
    op.sig = unblinded.toString();
    const resp = request.post(`${baseUrl}/operations`, {
      body: op,
      json: true
    });
    resp.status.should.equal(200);
    const result = BlindSignature.verify({ unblinded, N, E, message });
    result.should.equal(true);
  });

  it('apps should be able to get a verification', function() {
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
