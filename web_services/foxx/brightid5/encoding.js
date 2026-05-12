"use strict";
const B64 = require("base64-js");
const crypto = require("@arangodb/crypto");
const nacl = require("tweetnacl");
const secp256k1 = require("secp256k1");
const createKeccakHash = require("keccak");

const conf = module.context.configuration;

function uInt8ArrayToB64(array) {
  const b = Buffer.from(array);
  return b.toString("base64");
}

function b64ToUint8Array(str) {
  // B64.toByteArray might return a Uint8Array, an Array or an Object depending on the platform.
  // Wrap it in Object.values and new Uint8Array to make sure it's a Uint8Array.
  return new Uint8Array(Object.values(B64.toByteArray(str)));
}

function strToUint8Array(str) {
  return new Uint8Array(Buffer.from(str, "ascii"));
}

function b64ToUrlSafeB64(s) {
  const alts = {
    "/": "_",
    "+": "-",
    "=": "",
  };
  return s.replace(/[/+=]/g, (c) => alts[c]);
}

function urlSafeB64ToB64(s) {
  const alts = {
    _: "/",
    "-": "+",
  };
  s = s.replace(/[-_]/g, (c) => alts[c]);
  while (s.length % 4) {
    s += "=";
  }
  return s;
}

function hash(data) {
  const h = crypto.sha256(data);
  const b = Buffer.from(h, "hex").toString("base64");
  return b64ToUrlSafeB64(b);
}

function pad32(data) {
  return data + String.fromCharCode(0).repeat(32 - data.length);
}

function addressToBytes32(address) {
  const b = Buffer.from(address.substring(2), "hex").toString("binary");
  return String.fromCharCode(0).repeat(12) + b;
}

function priv2addr(priv) {
  if (!priv) {
    return null;
  }
  const publicKey = Buffer.from(
    Object.values(secp256k1.publicKeyCreate(priv, false).slice(1))
  );
  return (
    "0x" +
    createKeccakHash("keccak256")
      .update(publicKey)
      .digest()
      .slice(-20)
      .toString("hex")
  );
}

function getNaclKeyPair() {
  let publicKey, privateKey;
  if (conf.privateKey) {
    publicKey = uInt8ArrayToB64(
      Object.values(
        nacl.sign.keyPair.fromSecretKey(b64ToUint8Array(conf.privateKey))
          .publicKey
      )
    );
    privateKey = b64ToUint8Array(conf.privateKey);
  } else if (conf.seed) {
    const hex32 = crypto.sha256(conf.seed);
    const uint8Array = new Uint8Array(Buffer.from(hex32, "hex"));
    const naclKeyPair = nacl.sign.keyPair.fromSeed(uint8Array);
    publicKey = uInt8ArrayToB64(Object.values(naclKeyPair.publicKey));
    privateKey = naclKeyPair.secretKey;
  }
  return { publicKey, privateKey };
}

function getEthKeyPair() {
  let publicKey, privateKey;
  if (conf.ethPrivateKey) {
    privateKey = new Uint8Array(Buffer.from(conf.ethPrivateKey, "hex"));
    publicKey = Buffer.from(
      Object.values(secp256k1.publicKeyCreate(privateKey))
    ).toString("hex");
  } else if (conf.seed) {
    const hex32 = crypto.sha256(conf.seed);
    privateKey = new Uint8Array(Buffer.from(hex32, "hex"));
    publicKey = Buffer.from(
      Object.values(secp256k1.publicKeyCreate(privateKey))
    ).toString("hex");
  }
  return { publicKey, privateKey };
}

function getConsensusSenderAddress() {
  let address = null;
  if (conf.consensusSenderPrivateKey) {
    const uint8ArrayPrivateKey = new Uint8Array(
      Buffer.from(conf.consensusSenderPrivateKey, "hex")
    );
    address = priv2addr(uint8ArrayPrivateKey);
  } else if (conf.seed) {
    const hex32 = crypto.sha256(conf.seed);
    const uint8ArrayPrivateKey = new Uint8Array(Buffer.from(hex32, "hex"));
    address = priv2addr(uint8ArrayPrivateKey);
  }
  return address;
}

function recoverEthSigner(signature, message) {
  message = `\x19Ethereum Signed Message:\n${message.length}${message}`;
  const hexMessage = Buffer.from(message, "binary").toString("hex");
  const hashMessage = new Uint8Array(
    createKeccakHash("keccak256").update(hexMessage, "hex").digest()
  );
  const recid = parseInt(signature.slice(-2), 16) - 27;
  signature = new Uint8Array(Buffer.from(signature.slice(0, -2), "hex"));
  let publicKey = secp256k1.ecdsaRecover(signature, recid, hashMessage);
  publicKey = Buffer.from(
    secp256k1.publicKeyConvert(publicKey, false).buffer
  ).slice(1);
  publicKey = publicKey.toString("hex");
  publicKey = createKeccakHash("keccak256").update(publicKey, "hex").digest();
  return `0x${publicKey.slice(-20).toString("hex")}`;
}

module.exports = {
  uInt8ArrayToB64,
  b64ToUint8Array,
  strToUint8Array,
  b64ToUrlSafeB64,
  urlSafeB64ToB64,
  hash,
  pad32,
  addressToBytes32,
  priv2addr,
  getNaclKeyPair,
  getEthKeyPair,
  getConsensusSenderAddress,
  recoverEthSigner,
};
