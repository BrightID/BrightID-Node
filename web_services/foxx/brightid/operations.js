const stringify = require("fast-json-stable-stringify");
const db = require("./db");
const { db: arango, query } = require("@arangodb");
var CryptoJS = require("crypto-js");
const nacl = require("tweetnacl");
const {
  strToUint8Array,
  b64ToUint8Array,
  urlSafeB64ToB64,
  hash,
} = require("./encoding");
const errors = require("./errors");

const usersColl = arango._collection("users");
const operationCountersColl = arango._collection("operationCounters");

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences

const verifyUserSig = function (message, id, sig) {
  const user = db.loadUser(id);
  // When "Add Connection" is called on a user that is not created yet
  // signingKey can be calculated from user's brightid
  let signingKeys = user ? user.signingKeys : [urlSafeB64ToB64(id)];
  for (signingKey of signingKeys) {
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
  "Add Connection": ["id1", "id2"],
  "Remove Connection": ["id1"],
  "Add Group": ["id1"],
  "Remove Group": ["id"],
  "Add Membership": ["id"],
  "Remove Membership": ["id"],
  "Set Trusted Connections": ["id"],
  "Set Signing Key": ["id"],
  Sponsor: ["app"],
  "Spend Sponsorship": ["app"],
  "Link ContextId": ["id"],
  Invite: ["inviter"],
  Dismiss: ["dismisser"],
  "Add Admin": ["id"],
  "Add Signing Key": ["id"],
  "Remove Signing Key": ["id"],
  "Remove All Signing Keys": ["id"],
  "Update Group": ["id"],
};

function checkLimits(op, timeWindow, limit) {
  let expireDate;
  const now = Date.now();
  const senders = senderAttrs[op.name].map((attr) => op[attr]);
  for (let sender of senders) {
    // these condition structure is applying:
    // 1) a bucket for a verified user
    // 2) a bucket for children of a verified user
    // 3) a bucket for all non-verified users without parent
    // 4) a bucket for an app
    // where parent is the first verified user that make connection with the user
    if (!["Sponsor", "Spend Sponsorship"].includes(op["name"])) {
      if (!usersColl.exists(sender)) {
        // this happens when operation is "Add Connection" and one/both sides don't exist
        sender = "shared";
      } else {
        const user = usersColl.document(sender);
        const verifications = db
          .userVerifications(user._key)
          .map((v) => v.name);
        verified = verifications && verifications.includes("BrightID");
        if (!verified && user.parent) {
          // this happens when user is not verified but has a verified connection
          sender = `shared_${user.parent}`;
        } else if (!verified && !user.parent) {
          // this happens when user is not verified and does not have a verified connection
          sender = "shared";
        }
      }
    }
    const c = operationCountersColl.firstExample({ _key: sender });
    let counter = c ? c.counter : 0;
    expireDate = c ? c.expireDate : Math.ceil(now / 1000 + timeWindow / 1000);
    counter += 1;
    query`
      UPSERT { _key: ${sender} } 
        INSERT {
          _key: ${sender},
          counter: ${counter},
          expireDate: ${expireDate},
        }
        UPDATE { counter: ${counter} }
      IN operationCounters
    `;

    if (counter <= limit) {
      // if operation has multiple senders, this check will be passed
      // even if one of the senders did not reach limit yet
      return;
    }
  }

  throw new errors.TooManyOperationsError(
    senders,
    expireDate * 1000 - now,
    timeWindow,
    limit
  );
}

const signerAndSigs = {
  "Remove Connection": ["id1", "sig1"],
  "Add Group": ["id1", "sig1"],
  "Remove Group": ["id", "sig"],
  "Add Membership": ["id", "sig"],
  "Remove Membership": ["id", "sig"],
  "Set Trusted Connections": ["id", "sig"],
  "Link ContextId": ["id", "sig"],
  Invite: ["inviter", "sig"],
  Dismiss: ["dismisser", "sig"],
  "Add Admin": ["id", "sig"],
  "Update Group": ["id", "sig"],
  "Add Signing Key": ["id", "sig"],
  "Remove Signing Key": ["id", "sig"],
  "Remove All Signing Keys": ["id", "sig"],
};

function verify(op) {
  if (op.v != 5) {
    throw new errors.InvalidOperationVersionError(op.v);
  }
  if (op.timestamp > Date.now() + TIME_FUDGE) {
    throw new errors.InvalidOperationTimestampError(op.timestamp);
  }

  let message = getMessage(op);
  if (op.name == "Sponsor") {
    verifyAppSig(message, op.app, op.sig);
    db.alreadySponsored(op);
  } else if (op.name == "Spend Sponsorship") {
    // there is no sig on this operation
    return;
  } else if (op.name == "Set Signing Key") {
    const recoveryConnections = db.getRecoveryConnections(op.id);
    if (
      op.id1 == op.id2 ||
      !recoveryConnections.includes(op.id1) ||
      !recoveryConnections.includes(op.id2)
    ) {
      throw new errors.NotRecoveryConnectionsError();
    }
    verifyUserSig(message, op.id1, op.sig1);
    verifyUserSig(message, op.id2, op.sig2);
  } else if (op.name == "Add Connection") {
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
  } else if (op["name"] == "Add Connection") {
    // this operation is deprecated and will be removed on v6
    // use "Connect" instead
    return db.addConnection(op.id1, op.id2, op.timestamp);
  } else if (op["name"] == "Remove Connection") {
    // this operation is deprecated and will be removed on v6
    // use "Connect" instead
    return db.removeConnection(op.id1, op.id2, op.reason, op.timestamp);
  } else if (op["name"] == "Add Group") {
    return db.createGroup(
      op.group,
      op.id1,
      op.id2,
      op.inviteData2,
      op.id3,
      op.inviteData3,
      op.url,
      op.type,
      op.timestamp
    );
  } else if (op["name"] == "Remove Group") {
    return db.deleteGroup(op.group, op.id, op.timestamp);
  } else if (op["name"] == "Add Membership") {
    return db.addMembership(op.group, op.id, op.timestamp);
  } else if (op["name"] == "Remove Membership") {
    return db.deleteMembership(op.group, op.id, op.timestamp);
  } else if (op["name"] == "Set Trusted Connections") {
    // this operation is deprecated and will be removed on v6
    // use "Connect" instead
    return db.setRecoveryConnections(op.trusted, op.id, op.timestamp);
  } else if (op["name"] == "Set Signing Key") {
    return db.setSigningKey(op.signingKey, op.id, op.timestamp);
  } else if (["Sponsor", "Spend Sponsorship"].includes(op["name"])) {
    return db.sponsor(op);
  } else if (op["name"] == "Link ContextId") {
    return db.linkContextId(op.id, op.context, op.contextId, op.timestamp);
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
  } else {
    throw new errors.InvalidOperationNameError(op["name"]);
  }
}

function encrypt(op) {
  const { linkAESKey } = db.getContext(op.context);
  const jsonStr = stringify({ id: op.id, contextId: op.contextId });
  op.encrypted = CryptoJS.AES.encrypt(jsonStr, linkAESKey).toString();
  delete op.id;
  delete op.contextId;
}

function getMessage(op) {
  const signedOp = {};
  for (let k in op) {
    if (["sig", "sig1", "sig2", "hash", "blockTime"].includes(k)) {
      continue;
    } else if (op.name == "Set Signing Key" && ["id1", "id2"].includes(k)) {
      continue;
    }
    signedOp[k] = op[k];
  }
  return stringify(signedOp);
}

function decrypt(op) {
  const { linkAESKey } = db.getContext(op.context);
  const decrypted = CryptoJS.AES.decrypt(op.encrypted, linkAESKey).toString(
    CryptoJS.enc.Utf8
  );
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
  checkLimits,
  getMessage,
};
