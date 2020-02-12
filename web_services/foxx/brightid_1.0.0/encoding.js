"use strict";
const B64 = require('base64-js');

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

function uInt8ArrayToB64(array) {
  const b = Buffer.from(array);
  return b.toString('base64');
}

function pad32(data) {
  return data + String.fromCharCode('00').repeat(32 - data.length);
};

module.exports = {
  b64ToUint8Array,
  strToUint8Array,
  b64ToUrlSafeB64,
  uInt8ArrayToB64,
  pad32
};