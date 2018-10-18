"use strict";

function b64ToUint8Array (str){
  var b = new Buffer(str, 'base64');
  return new Uint8Array(b.slice());
}

function strToUint8Array(str){
  var b = new Buffer(str);
  return new Uint8Array(b.slice());
}

module.exports = {
  b64ToUint8Array: b64ToUint8Array,
  strToUint8Array: strToUint8Array
};