const stringify = require("fast-json-stable-stringify");
const db = require("./db");
const arango = require("@arangodb").db;
const nacl = require("tweetnacl");

const {
  strToUint8Array,
  b64ToUint8Array,
  urlSafeB64ToB64,
  hash,
} = require("./encoding");
const errors = require("./errors");

const usersColl = arango._collection("users");
const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

const verifyUserSig = function (message, id, sig) {
  // When "Connect" is called by a user that is not created yet
  // signingKey can be calculated from user's brightid
  let signingKeys = usersColl.exists(id)
    ? usersColl.document(id).signingKeys
    : [urlSafeB64ToB64(id)];
  for (let signingKey of signingKeys) {
    if (
      nacl.sign.detached.verify(
        strToUint8Array(message),
        b64ToUint8Array(sig),
        b64ToUint8Array(signingKey)
      )
    ) {
      return signingKey;
    }
  }
  throw new errors.InvalidSignatureError();
};

const verifyAppSig = function (message, app, sig) {
  app = db.getApp(app);
  if (
    !nacl.sign.detached.verify(
      strToUint8Array(message),
      b64ToUint8Array(sig),
      b64ToUint8Array(app.sponsorPublicKey)
    )
  ) {
    throw new errors.InvalidSignatureError();
  }
};

const senderAttrs = {
  Connect: ["id1"],
  "Add Group": ["id"],
  "Remove Group": ["id"],
  "Add Membership": ["id"],
  "Remove Membership": ["id"],
  "Social Recovery": ["id"],
  Sponsor: ["app"],
  "Spend Sponsorship": ["app"],
  Invite: ["inviter"],
  Dismiss: ["dismisser"],
  "Add Admin": ["id"],
  "Add Signing Key": ["id"],
  "Remove Signing Key": ["id"],
  "Remove All Signing Keys": ["id"],
  "Update Group": ["id"],
  "Vouch Family": ["id"],
  "Set Family Head": ["id"],
  "Convert To Family": ["id"],
};

let operationsCount = {};
let resetTime = 0;
function checkLimits(op, timeWindow, limit) {
  const now = Date.now();
  if (now > resetTime) {
    operationsCount = {};
    resetTime = now + timeWindow;
  }
  const senders = senderAttrs[op.name].map((attr) => op[attr]);
  for (let sender of senders) {
    // these condition structure is applying:
    // 1) a bucket for a verified user
    // 2) a bucket for children of a verified user
    // 3) a bucket for all non-verified users without parent
    // where parent is the first verified user that make connection with the user
    if (!usersColl.exists(sender)) {
      // this happens when operation is "Connect" and sender does not exist
      sender = "shared";
    } else {
      const user = usersColl.document(sender);
      const verifications = db.userVerifications(user._key).map((v) => v.name);
      verified = verifications && verifications.includes("BrightID");
      if (!verified && user.parent) {
        // this happens when user is not verified but has a verified connection
        sender = `shared_${user.parent}`;
      } else if (!verified && !user.parent) {
        // this happens when user is not verified and does not have a verified connection
        sender = "shared";
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
  throw new errors.TooManyOperationsError(
    senders,
    resetTime - now,
    timeWindow,
    limit
  );
}

const signerAndSigs = {
  "Add Group": ["id", "sig"],
  "Remove Group": ["id", "sig"],
  "Add Membership": ["id", "sig"],
  "Remove Membership": ["id", "sig"],
  Invite: ["inviter", "sig"],
  Dismiss: ["dismisser", "sig"],
  "Add Admin": ["id", "sig"],
  "Update Group": ["id", "sig"],
  "Add Signing Key": ["id", "sig"],
  "Remove Signing Key": ["id", "sig"],
  "Remove All Signing Keys": ["id", "sig"],
  "Vouch Family": ["id", "sig"],
  "Set Family Head": ["id", "sig"],
  "Convert To Family": ["id", "sig"],
};

function verify(op) {
  if (op.v != 6) {
    throw new errors.InvalidOperationVersionError(op.v);
  }
  if (op.timestamp > Date.now() + TIME_FUDGE) {
    throw new errors.InvalidOperationTimestampError(op.timestamp);
  }

  let message = getMessage(op);
  if (op.name == "Sponsor") {
    verifyAppSig(message, op.app, op.sig);
  } else if (op.name == "Spend Sponsorship") {
    // there is no sig on this operation
    return;
  } else if (op.name == "Social Recovery") {
    const recoveryConnections = db.getRecoveryConnections(op.id);
    if (op.id1 == op.id2) {
      throw new errors.DuplicateSignersError();
    }
    const rc1 = recoveryConnections.find((c) => c.id == op.id1);
    const rc2 = recoveryConnections.find((c) => c.id == op.id2);
    if (!rc1 || !rc2) {
      throw new errors.NotRecoveryConnectionsError();
    } else if (rc1.activeAfter != 0) {
      throw new errors.WaitForCooldownError(op.id1);
    } else if (rc2.activeAfter != 0) {
      throw new errors.WaitForCooldownError(op.id2);
    }
    verifyUserSig(message, op.id1, op.sig1);
    verifyUserSig(message, op.id2, op.sig2);
  } else if (op.name == "Connect") {
    verifyUserSig(message, op.id1, op.sig1);
    if (op.requestProof) {
      verifyUserSig(op.id2 + "|" + op.timestamp, op.id2, op.requestProof);
    }
  } else {
    const [signerAttr, sigAttr] = signerAndSigs[op.name];
    const signer = op[signerAttr];
    const sig = op[sigAttr];
    verifyUserSig(message, signer, sig);
  }
  if (hash(message) != op.hash) {
    throw new errors.InvalidOperationHashError();
  }
}

function apply(op) {
  if (op["name"] == "Remove All Signing Keys") {
    // verifyUserSig returns the key that used to sign the op
    // removeAllSigningKeys remove all keys except this one
    const signingKey = verifyUserSig(getMessage(op), op.id, op.sig);
    op.timestamp = op.blockTime;
    return db.removeAllSigningKeys(op.id, signingKey, op.timestamp);
  }

  // set the block time instead of user timestamp
  op.timestamp = op.blockTime;
  if (op["name"] == "Connect") {
    return db.connect(op);
  } else if (op["name"] == "Add Group") {
    return db.createGroup(op.group, op.id, op.url, op.type, op.timestamp);
  } else if (op["name"] == "Remove Group") {
    return db.deleteGroup(op.group, op.id, op.timestamp);
  } else if (op["name"] == "Add Membership") {
    return db.addMembership(op.group, op.id, op.timestamp);
  } else if (op["name"] == "Remove Membership") {
    return db.deleteMembership(op.group, op.id, op.timestamp);
  } else if (op["name"] == "Social Recovery") {
    return db.setSigningKey(op.signingKey, op.id, op.timestamp);
  } else if (["Sponsor", "Spend Sponsorship"].includes(op["name"])) {
    return db.sponsor(op);
  } else if (op["name"] == "Invite") {
    return db.invite(op.inviter, op.invitee, op.group, op.data, op.timestamp);
  } else if (op["name"] == "Dismiss") {
    return db.dismiss(op.dismisser, op.dismissee, op.group, op.timestamp);
  } else if (op["name"] == "Add Admin") {
    return db.addAdmin(op.id, op.admin, op.group, op.timestamp);
  } else if (op["name"] == "Add Signing Key") {
    return db.addSigningKey(op.id, op.signingKey, op.timestamp);
  } else if (op["name"] == "Remove Signing Key") {
    return db.removeSigningKey(op.id, op.signingKey, op.timestamp);
  } else if (op["name"] == "Update Group") {
    return db.updateGroup(op.id, op.group, op.url, op.timestamp);
  } else if (op["name"] == "Vouch Family") {
    return db.vouchFamily(op.id, op.group, op.timestamp);
  } else if (op["name"] == "Set Family Head") {
    return db.setFamilyHead(op.id, op.head, op.group, op.timestamp);
  } else if (op["name"] == "Convert To Family") {
    return db.convertToFamily(op.id, op.head, op.group, op.timestamp);
  } else {
    throw new errors.InvalidOperationNameError(op["name"]);
  }
}

function getMessage(op) {
  const signedOp = {};
  for (let k in op) {
    if (
      [
        "sig",
        "sig1",
        "sig2",
        "hash",
        "blockTime",
        "n",
        "e",
        "unblinded",
      ].includes(k)
    ) {
      continue;
    } else if (op.name == "Social Recovery" && ["id1", "id2"].includes(k)) {
      continue;
    }
    signedOp[k] = op[k];
  }
  return stringify(signedOp);
}

module.exports = {
  verify,
  apply,
  verifyUserSig,
  checkLimits,
  getMessage,
};
