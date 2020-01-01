const db = require('./db');
var CryptoJS = require("crypto-js");
const nacl = require('tweetnacl');
const {
  strToUint8Array,
  b64ToUint8Array,
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  hash
} = require('./encoding');

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

const verifyUserSig = function(message, id, sig) {
  const user = db.loadUser(id);
  if (!user) {
    throw 'invalid id';
  }
  if (!nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(user.signingKey))) {
    throw 'invalid signature';
  }
}

const verifyContextSig = function(message, context, sig) {
  context = db.getContext(context);
  if (!context) {
    throw 'invalid context';
  }
  if (!nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(context.signingKey))) {
    throw 'invalid signature';
  }
}

const operationsData = {
  'Add Connection': {'attrs': ['id1', 'id2', 'sig1', 'sig2']},
  'Remove Connection': {'attrs': ['id1', 'id2', 'sig1']},
  'Add Group': {'attrs': ['id1', 'id2', 'id3', 'sig1']},
  'Remove Group': {'attrs': ['id', 'group', 'sig']},
  'Add Membership': {'attrs': ['id', 'group', 'sig']},
  'Remove Membership': {'attrs': ['id', 'group', 'sig']},
  'Set Trusted Connections': {'attrs': ['id', 'trusted', 'sig']},
  'Set Signing Key': {'attrs': ['id', 'signingKey', 'id1', 'id2', 'sig1', 'sig2']},
  'Verify Account': {'attrs': ['id', 'account', 'context', 'sig', 'sponsorshipSig']},
};

const defaultOperationKeys = ['name', 'timestamp', '_key', 'state'];

function verify(op) {
  if (op.timestamp > Date.now() + TIME_FUDGE) {
    throw "timestamp can't be in the future";
  }
  let message, validAttributes;
  if (op['name'] == 'Add Connection') {
    message = op.name + op.id1 + op.id2 + op.timestamp;
    verifyUserSig(message, op.id1, op.sig1);
    verifyUserSig(message, op.id2, op.sig2);
  } else if (op['name'] == 'Remove Connection') {
    message = op.name + op.id1 + op.id2 + op.timestamp;
    verifyUserSig(message, op.id1, op.sig1);
  } else if (op['name'] == 'Add Group') {
    message = op.name + op.id1 + op.id2 + op.id3 + op.timestamp;
    verifyUserSig(message, op.id1, op.sig1);
  } else if (op['name'] == 'Remove Group') {
    message = op.name + op.id + op.group + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
  } else if (op['name'] == 'Add Membership') {
    message = op.name + op.id + op.group + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
  } else if (op['name'] == 'Remove Membership') {
    message = op.name + op.id + op.group + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
  } else if (op['name'] == 'Set Trusted Connections') {
    message = op.name + op.id + op.trusted.join(',') + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
  } else if (op['name'] == 'Set Signing Key') {
    message = op.name + op.id + op.signingKey + op.timestamp;
    verifyUserSig(message, op.id1, op.sig1);
    verifyUserSig(message, op.id2, op.sig2);
  } else if (op['name'] == 'Verify Account') {
    message = op.name + op.context + op.account + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
    if (op.sponsorshipSig) {
      message = 'Sponsor' + op.context + op.account + op.timestamp;
      verifyContextSig(message, op.context, op.sponsorshipSig);
    }
  } else {
    throw "invalid operation";
  }
  if (hash(message) != op._key) {
    throw 'invalid hash'
  }
  if (db.isOperationApplied(op._key)) {
    throw "operation is applied before";
  }
  for (let k of Object.keys(op)) {
    if (defaultOperationKeys.indexOf(k)<0 && operationsData[op.name].attrs.indexOf(k)<0) {
      throw k + ' is not a valid attribute';
    }
  }
}

function apply(op) {
  if (op['name'] == 'Add Connection') {
    return db.addConnection(op.id1, op.id2, op.timestamp);
  } else if (op['name'] == 'Remove Connection') {
    return db.removeConnection(op.id1, op.id2, op.timestamp);
  } else if (op['name'] == 'Add Group') {
    // fixme: group id should be a hash of its founders id
    return db.createGroup(op.id1, op.id2, op.id3, op.timestamp);
  } else if (op['name'] == 'Remove Group') {
    return db.deleteGroup(op.group, op.id, op.timestamp);
  } else if (op['name'] == 'Add Membership') {
    return db.addMembership(op.group, op.id, op.timestamp);
  } else if (op['name'] == 'Remove Membership') {
    return db.deleteMembership(op.group, op.id, op.timestamp);
  } else if (op['name'] == 'Set Trusted Connections') {
    return db.setTrusted(op.trusted, op.id, op.timestamp);
  } else if (op['name'] == 'Set Signing Key') {
    return db.setSigningKey(op.signingKey, op.id, [op.id1, op.id2], op.timestamp);
  } else if (op['name'] == 'Verify Account') {
    return db.verifyAccount(op.id, op.account, op.context, op.timestamp, op.sponsorshipSig);
  } else {
    throw "invalid operation";
  }
  // fixme: add operation to operationHashes
}

function encrypt(op) {
  const { secretKey } = db.getContext(op.context);
  const jsonStr = JSON.stringify({ 'id': op.id, 'account': op.account });
  op.encrypted = CryptoJS.AES.encrypt(jsonStr, secretKey).toString();
  delete op.id;
  delete op.account;
}

function decrypt(op) {
  const { secretKey } = db.getContext(op.context);
  const decrypted = CryptoJS.AES.decrypt(op.encrypted, secretKey)
                      .toString(CryptoJS.enc.Utf8);
  const json = JSON.parse(decrypted);
  delete op.encrypted;
  op.id = json.id;
  op.account = json.account;
}

module.exports = {
  verify,
  apply,
  encrypt,
  decrypt,
  verifyUserSig
};
