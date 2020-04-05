"use strict";
const B64 = require('base64-js');
const crypto = require('@arangodb/crypto');

function uInt8ArrayToB64(array) {
  const b = Buffer.from(array);
  return b.toString('base64');
}

function b64ToUint8Array(str) {
  // B64.toByteArray might return a Uint8Array, an Array or an Object depending on the platform.
  // Wrap it in Object.values and new Uint8Array to make sure it's a Uint8Array.
  return new Uint8Array(Object.values(B64.toByteArray(str)));
}

function strToUint8Array(str) {
  return new Uint8Array(Buffer.from(str, 'ascii'));
}

function b64ToUrlSafeB64(s) {
  const alts = {
    '/': '_',
    '+': '-',
    '=': ''
  };
  return s.replace(/[/+=]/g, (c) => alts[c]);
}

function urlSafeB64ToB64(s) {
  const alts = {
    '_': '/',
    '-': '+'
  };
  s = s.replace(/[-_]/g, (c) => alts[c]);
  while (s.length % 4) {
    s += '=';
  }
  return s;
}

function hash(data) {
  const h = crypto.sha256(data);
  const b = Buffer.from(h, 'hex').toString('base64');
  return b64ToUrlSafeB64(b);
}

function pad32(data) {
  return data + String.fromCharCode(0).repeat(32 - data.length);
}

function addressToBytes32(address) {
  const b = Buffer.from(address.substring(2), 'hex').toString("binary");
  return b + String.fromCharCode(0).repeat(12);
}

module.exports = {
  uInt8ArrayToB64,
  b64ToUint8Array,
  strToUint8Array,
  b64ToUrlSafeB64,
  urlSafeB64ToB64,
  hash,
  pad32,
  addressToBytes32
};
