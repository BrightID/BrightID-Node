const db = require('./db');
const arango = require('@arangodb').db;
var CryptoJS = require("crypto-js");
const nacl = require('tweetnacl');
const {
  strToUint8Array,
  b64ToUint8Array,
  uInt8ArrayToB64,
  b64ToUrlSafeB64,
  urlSafeB64ToB64,
  hash
} = require('./encoding');

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

const verifyUserSig = function(message, id, sig) {
  const user = db.loadUser(id);
  // this will happen for "Add Connection" when one party is not created
  // this also enable this version of code to be used by the old users collection
  // for users that don't have signingKey
  const signingKey = (user && user.signingKey) ? user.signingKey : urlSafeB64ToB64(id);
  if (!nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(signingKey))) {
    throw 'invalid signature';
  }
}

const verifyContextSig = function(message, context, sig) {
  context = db.getContext(context);
  if (!context) {
    throw 'invalid context';
  }
  if (!nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(context.sponsorPublicKey))) {
    throw 'invalid signature';
  }
}

const senderAttrs = {
  'Add Connection': ['id1', 'id2'],
  'Remove Connection': ['id1'],
  'Add Group': ['id1'],
  'Remove Group': ['id'],
  'Add Membership': ['id'],
  'Remove Membership': ['id'],
  'Set Trusted Connections': ['id'],
  'Set Signing Key': ['id'],
  'Sponsor': ['context'],
  'Link ContextId': ['id'],
  'Invite': ['inviter'],
  'Dismiss': ['dismisser'],
  'Add Admin': ['id'],
};
let operationsCount = {};
let resetTime = 0;
function checkLimits(op, timeWindow, limit) {
  if (Date.now() > resetTime) {
    operationsCount = {};
    resetTime =  Date.now() + timeWindow;
  }
  const senders = senderAttrs[op.name].map(attr => op[attr]);
  const usersColl = arango._collection('users');
  for (let sender of senders) {
    // these condition structure is applying:
    // 1) a bucket for a verified user
    // 2) a bucket for children of a verified user
    // 3) a bucket for all non-verified users without parent
    // where parent is the first verified user that make connection with the user
    if (!usersColl.exists(sender)) {
      // this happens when operation is "Add Connection" and one/both sides don't exist
      sender = 'shared';
    } else {
      const user = usersColl.document(sender);
      verified = user.verifications && user.verifications.includes('BrightID');
      if (!verified && user.parent) {
        // this happens when user is not verified but has a verified connection
        sender = `shared_${user.parent}`;
      } else if (!verified && !user.parent) {
        // this happens when user is not verified and does not have a verified connection
        sender = 'shared';
      }
    }
    if (!operationsCount[sender]) {
      operationsCount[sender] = 0;
    }
    operationsCount[sender] += 1;
    if (operationsCount[sender] <= limit) {
      // if operation has multiple senders, this check will be passed
      // even if one of the senders did not reach limit yet
      return;
    }
  }
  throw 'Too Many Requests';
}

function verify(op) {
  if (op.v != 4) {
    throw 'invalid operation version';
  }
  if (op.timestamp > Date.now() + TIME_FUDGE) {
    throw "timestamp can't be in the future";
  }
  let message, validAttributes;
  if (op['name'] == 'Add Connection') {
    message = op.name + op.id1 + op.id2 + op.timestamp;
    verifyUserSig(message, op.id1, op.sig1);
    verifyUserSig(message, op.id2, op.sig2);
  } else if (op['name'] == 'Remove Connection') {
    message = op.name + op.id1 + op.id2 + op.reason + op.timestamp;
    verifyUserSig(message, op.id1, op.sig1);
  } else if (op['name'] == 'Add Group') {
    message = op.name + op.group + op.id1 + op.id2 + op.inviteData2 + op.id3 + op.inviteData3 + op.url + op.type + op.timestamp;
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
  } else if (op['name'] == 'Sponsor') {
    if (op.id) {
      message = 'Sponsor' + ',' + op.context + ',' + op.id;
    } else {
      message = 'Sponsor' + ',' + op.context + ',' + op.contextId;
    }
    verifyContextSig(message, op.context, op.sig);
  } else if (op['name'] == 'Link ContextId') {
    message = op.name + ',' + op.context + ',' + op.contextId + ',' + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
  } else if (op['name'] == 'Invite') {
    message = op.name + op.inviter + op.invitee + op.group + op.data + op.timestamp;
    verifyUserSig(message, op.inviter, op.sig);
  } else if (op['name'] == 'Dismiss') {
    message = op.name + op.dismisser + op.dismissee + op.group + op.timestamp;
    verifyUserSig(message, op.dismisser, op.sig);
  } else if (op['name'] == 'Add Admin') {
    message = op.name + op.id + op.admin + op.group + op.timestamp;
    verifyUserSig(message, op.id, op.sig);
  } else {
    throw "invalid operation";
  }
  if (hash(message) != op._key) {
    throw 'invalid hash';
  }
}

function apply(op) {
  if (op['name'] == 'Add Connection') {
    return db.addConnection(op.id1, op.id2, op.timestamp);
  } else if (op['name'] == 'Remove Connection') {
    return db.removeConnection(op.id1, op.id2, op.reason, op.timestamp);
  } else if (op['name'] == 'Add Group') {
    return db.createGroup(op.group, op.id1, op.id2, op.inviteData2, op.id3, op.inviteData3, op.url, op.type, op.timestamp);
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
  } else if (op['name'] == 'Sponsor') {
    return db.sponsor(op.id, op.context);
  } else if (op['name'] == 'Link ContextId') {
    return db.linkContextId(op.id, op.context, op.contextId, op.timestamp);
  } else if (op['name'] == 'Invite') {
    return db.invite(op.inviter, op.invitee, op.group, op.data, op.timestamp);
  } else if (op['name'] == 'Dismiss') {
    return db.dismiss(op.dismisser, op.dismissee, op.group, op.timestamp);
  } else if (op['name'] == 'Add Admin') {
    return db.addAdmin(op.id, op.admin, op.group, op.timestamp);
  } else {
    throw "invalid operation";
  }
  // fixme: add operation to operationHashes
}

function encrypt(op) {
  const { linkAESKey } = db.getContext(op.context);
  const jsonStr = JSON.stringify({ 'id': op.id, 'contextId': op.contextId });
  op.encrypted = CryptoJS.AES.encrypt(jsonStr, linkAESKey).toString();
  delete op.id;
  delete op.contextId;
}

function updateSponsorOp(op) {
  const { sponsorPrivateKey, collection, idsAsHex } = db.getContext(op.context);
  const coll = arango._collection(collection);

  if (idsAsHex) {
    op.contextId = op.contextId.toLowerCase();
  }

  op.id = db.getUserByContextId(coll, op.contextId)
  if (!op.id) {
    throw 'unlinked context id';
  }

  let message = 'Sponsor' + ',' + op.context + ',' + op.id;
  op.sig = uInt8ArrayToB64(Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(sponsorPrivateKey))));
  op._key = hash(message);
  delete op.contextId;
}

function decrypt(op) {
  const { linkAESKey } = db.getContext(op.context);
  const decrypted = CryptoJS.AES.decrypt(op.encrypted, linkAESKey)
                      .toString(CryptoJS.enc.Utf8);
  const json = JSON.parse(decrypted);
  delete op.encrypted;
  op.id = json.id;
  op.contextId = json.contextId;
}

module.exports = {
  verify,
  apply,
  encrypt,
  decrypt,
  verifyUserSig,
  updateSponsorOp,
  checkLimits
};
