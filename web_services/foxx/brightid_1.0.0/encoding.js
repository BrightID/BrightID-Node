"use strict";
const B64 = require('base64-js');

function b64ToUint8Array(str) {
  return new Uint8Array(B64.toByteArray(str));
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

module.exports = {
  b64ToUint8Array,
  strToUint8Array,
  b64ToUrlSafeB64,
};