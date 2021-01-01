const stringify = require('fast-json-stable-stringify');
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

const verifyUserSig = function(message, id, sig, opName) {
  const user = db.loadUser(id);
  // When "Add Connection" is called on a user that is not created yet
  // signingKey can be calculated from user's brightid
  let signingKey = user ? user.signingKey : urlSafeB64ToB64(id)
  const signingKeys = [signingKey];
  // 'Add Subkey' and 'Remove Subkey' can only be signed using master key
  if (! ['Add Subkey', 'Remove Subkey'].includes(opName)) {
    const subkeys = (user && user.subkeys) || [];
    signingKeys.push(...subkeys)
  }

  for (signingKey of signingKeys) {
    if (nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(signingKey))) {
      return;
    }
  }
  throw 'invalid signature';
}

const verifyAppSig = function(message, app, sig) {
  app = db.getApp(app);
  if (!app) {
    throw 'invalid app';
  }
  if (!nacl.sign.detached.verify(strToUint8Array(message), b64ToUint8Array(sig), b64ToUint8Array(app.sponsorPublicKey))) {
    throw 'invalid signature';
  }
}

const senderAttrs = {
  'Connect': ['id1'],
  'Add Connection': ['id1', 'id2'],
  'Remove Connection': ['id1'],
  'Add Group': ['id1'],
  'Remove Group': ['id'],
  'Add Membership': ['id'],
  'Remove Membership': ['id'],
  'Set Trusted Connections': ['id'],
  'Set Signing Key': ['id'],
  'Sponsor': ['app'],
  'Link ContextId': ['id'],
  'Invite': ['inviter'],
  'Dismiss': ['dismisser'],
  'Add Admin': ['id'],
  'Add Subkey': ['id'],
  'Remove Subkey': ['id'],
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
      const verifications = db.userVerifications(user._key).map(v => v.name);
      verified = verifications && verifications.includes('BrightID');
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

const requiredSigs = {
  'Connect': [['id1', 'sig1']],
  'Add Connection': [['id1', 'sig1'], ['id2', 'sig2']],
  'Remove Connection': [['id1', 'sig1']],
  'Add Group': [['id1', 'sig1']],
  'Remove Group': [['id', 'sig']],
  'Add Membership': [['id', 'sig']],
  'Remove Membership': [['id', 'sig']],
  'Set Trusted Connections': [['id', 'sig']],
  'Set Signing Key': [['id1', 'sig1'], ['id2', 'sig2']],
  'Sponsor': [['app', 'sig']],
  'Link ContextId': [['id', 'sig']],
  'Invite': [['inviter', 'sig']],
  'Dismiss': [['dismisser', 'sig']],
  'Add Admin': [['id', 'sig']],
  'Add Subkey': [['id', 'sig']],
  'Remove Subkey': [['id', 'sig']],
}

function verify(op) {
  if (op.v != 5) {
    throw 'invalid operation version';
  }
  if (op.timestamp > Date.now() + TIME_FUDGE) {
    throw "timestamp can't be in the future";
  }
  let message = getMessage(op);
  requiredSigs[op.name].forEach(idAndSig => {
    const id = op[idAndSig[0]];
    const sig = op[idAndSig[1]];
    if (op.name == 'Sponsor') {
      verifyAppSig(message, id, sig);
    } else {
      try {
        verifyUserSig(message, id, sig, op.name);
      } catch(e) {
        // allow adding connections by clients using v4 api
        // or getting their help to recover
        // this try and catch should be removed after v4 support dropped
        if (op.name == 'Add Connection') {
          const v4message = op.name + op.id1 + op.id2 + op.timestamp;
          verifyUserSig(v4message, id, sig, op.name);
        } else {
          throw e;
        }
      }
    }
  });
  if (op.name == 'Connect' && op.requestProof) {
    verifyUserSig(op.id2 + '|' + op.timestamp, op.id2, op.requestProof, op.name);
  }
  if (hash(message) != op.hash) {
    throw 'invalid hash';
  }
}

function apply(op) {
  // set the block time instead of user timestamp
  op.timestamp = op.blockTime;
  if (op['name'] == 'Connect') {
    return db.connect(op);
  } else if (op['name'] == 'Add Connection') {
    // this operation is deprecated and will be removed on v6
    // use "Connect" instead
    return db.addConnection(op.id1, op.id2, op.timestamp);
  } else if (op['name'] == 'Remove Connection') {
    // this operation is deprecated and will be removed on v6
    // use "Connect" instead
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
    // this operation is deprecated and will be removed on v6
    // use "Connect" instead
    return db.setRecoveryConnections(op.trusted, op.id, op.timestamp);
  } else if (op['name'] == 'Set Signing Key') {
    return db.setSigningKey(op.signingKey, op.id, [op.id1, op.id2], op.timestamp);
  } else if (op['name'] == 'Sponsor') {
    return db.sponsor(op.id, op.app, op.timestamp);
  } else if (op['name'] == 'Link ContextId') {
    return db.linkContextId(op.id, op.context, op.contextId, op.timestamp);
  } else if (op['name'] == 'Invite') {
    return db.invite(op.inviter, op.invitee, op.group, op.data, op.timestamp);
  } else if (op['name'] == 'Dismiss') {
    return db.dismiss(op.dismisser, op.dismissee, op.group, op.timestamp);
  } else if (op['name'] == 'Add Admin') {
    return db.addAdmin(op.id, op.admin, op.group, op.timestamp);
  } else if (op['name'] == 'Add Subkey') {
    return db.addSubkey(op.id, op.subkey, op.timestamp);
  } else if (op['name'] == 'Remove Subkey') {
    return db.removeSubkey(op.id, op.subkey, op.timestamp);
  } else {
    throw "invalid operation";
  }
}

function encrypt(op) {
  const { linkAESKey } = db.getContext(op.context);
  const jsonStr = stringify({ 'id': op.id, 'contextId': op.contextId });
  op.encrypted = CryptoJS.AES.encrypt(jsonStr, linkAESKey).toString();
  delete op.id;
  delete op.contextId;
}

function getMessage(op) {
  const signedOp = {};
  for (let k in op) {
    if (['sig', 'sig1', 'sig2', 'hash', 'blockTime'].includes(k)) {
      continue;
    } else if (op.name == 'Set Signing Key' && ['id1', 'id2'].includes(k)) {
      continue;
    }
    signedOp[k] = op[k];
  }
  return stringify(signedOp);
}

function updateSponsorOp(op) {
  const { sponsorPrivateKey, context } = db.getApp(op.app);
  const { collection, idsAsHex } = db.getContext(context);
  const coll = arango._collection(collection);

  if (idsAsHex) {
    op.contextId = op.contextId.toLowerCase();
  }

  op.id = db.getUserByContextId(coll, op.contextId)
  if (!op.id) {
    throw 'unlinked context id';
  }

  delete op.contextId;
  let message = getMessage(op);
  op.sig = uInt8ArrayToB64(Object.values(nacl.sign.detached(strToUint8Array(message), b64ToUint8Array(sponsorPrivateKey))));
  op.hash = hash(message);
}

function decrypt(op) {
  const { linkAESKey } = db.getContext(op.context);
  const decrypted = CryptoJS.AES.decrypt(op.encrypted, linkAESKey)
                      .toString(CryptoJS.enc.Utf8);
  const json = JSON.parse(decrypted);
  delete op.encrypted;
  op.id = json.id;
  op.contextId = json.contextId;
  op.hash = hash(getMessage(op));
}

module.exports = {
  verify,
  apply,
  encrypt,
  decrypt,
  verifyUserSig,
  updateSponsorOp,
  checkLimits,
  getMessage
};
