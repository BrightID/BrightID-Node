"use strict";

function b64ToUint8Array (str){
  var b = new Buffer(str, 'base64');
  return new Uint8Array(b.slice());
}

function strToUint8Array(str){
  var b = new Buffer(str);
  return new Uint8Array(b.slice());
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
}