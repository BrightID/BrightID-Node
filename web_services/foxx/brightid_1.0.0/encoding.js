"use strict";
const B64 = require('base64-js');

function b64ToUint8Array(str) {
  return Object.values(B64.toByteArray(str));
}

function strToUint8Array(str) {
  const b = Buffer.from(str);
  return b.slice(b.byteOffset, b.byteOffset + b.byteLength);
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