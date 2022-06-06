"use strict";
const stringify = require("fast-json-stable-stringify");
const secp256k1 = require("secp256k1");
const createKeccakHash = require("keccak");
const BigInteger = require("jsbn").BigInteger;
const createRouter = require("@arangodb/foxx/router");
const _ = require("lodash");
const joi = require("joi");
const { db: arango, ArangoError } = require("@arangodb");
const nacl = require("tweetnacl");
const db = require("./db");
const schemas = require("./schemas").schemas;
const operations = require("./operations");
const WISchnorrServer = require("./WISchnorrServer");
const WISchnorrClient = require("./WISchnorrClient");
const crypto = require("@arangodb/crypto");
const {
  strToUint8Array,
  uInt8ArrayToB64,
  hash,
  pad32,
  addressToBytes32,
  getNaclKeyPair,
  getEthKeyPair,
} = require("./encoding");
const parser = require("expr-eval").Parser;
const errors = require("./errors");

const router = createRouter();
module.context.use(router);
const usersColl = arango._collection("users");
const operationsHashesColl = arango._collection("operationsHashes");
const signedVerificationsColl = arango._collection("signedVerifications");
const cachedParamsColl = arango._collection("cachedParams");
const appIdsColl = arango._collection("appIds");

const TIME_FUDGE = 60 * 60 * 1000; // timestamp can be this far in the future (milliseconds) to accommodate client/server clock differences
const MAX_OP_SIZE = 2000;

const handlers = {
  operationsPost: function (req, res) {
    const op = req.body;
    const message = operations.getMessage(op);
    op.hash = hash(message);

    if (operationsHashesColl.exists(op.hash)) {
      throw new errors.OperationAppliedBeforeError(op.hash);
    } else if (JSON.stringify(op).length > MAX_OP_SIZE) {
      throw new errors.TooBigOperationError(MAX_OP_SIZE);
    }

    // verify signature
    operations.verify(op);

    // allow limited number of operations to be posted in defined time window
    const timeWindow = module.context.configuration.operationsTimeWindow * 1000;
    const limit = module.context.configuration.operationsLimit;
    operations.checkLimits(op, timeWindow, limit);

    op.state = "init";
    db.upsertOperation(op);

    res.send({
      data: {
        hash: op.hash,
      },
    });
  },

  operationGet: function (req, res) {
    const hash = req.param("hash");
    const op = db.loadOperation(hash);
    if (op) {
      res.send({
        data: {
          state: op.state,
          result: op.result,
        },
      });
    } else {
      throw new errors.OperationNotFoundError(hash);
    }
  },

  userConnectionsGet: function (req, res) {
    const id = req.param("id");
    const direction = req.param("direction");
    res.send({
      data: {
        connections: db.userConnections(id, direction),
      },
    });
  },

  userVerificationsGet: function (req, res) {
    const id = req.param("id");
    res.send({
      data: {
        verifications: db.userVerifications(id),
      },
    });
  },

  userInvitesGet: function (req, res) {
    const id = req.param("id");
    res.send({
      data: {
        invites: db.userInvites(id),
      },
    });
  },

  userMembershipsGet: function (req, res) {
    const id = req.param("id");
    res.send({
      data: {
        memberships: db.userMemberships(id),
      },
    });
  },

  userFamiliesToVouchGet: function (req, res) {
    const id = req.param("id");
    res.send({
      data: {
        families: db.userFamiliesToVouch(id),
      },
    });
  },

  userProfileGet: function (req, res) {
    const id = req.param("id");
    const requestor = req.param("requestor");
    const user = db.getUser(id);
    const data = {};

    data.id = id;
    data.sponsored = db.isSponsored(id);
    data.verifications = db.userVerifications(id);
    data.recoveryConnections = db.getRecoveryConnections(id);
    const connections = db.userConnections(id, "inbound");
    const memberships = db.userMemberships(id);
    const isKnown = (c) =>
      ["just met", "already known", "recovery"].includes(c.level);
    data.connectionsNum = connections.filter(isKnown).length;
    data.groupsNum = memberships.length;
    data.reports = connections
      .filter((c) => c.level === "reported")
      .map((c) => {
        return { id: c.id, reason: c.reportReason };
      });
    data.createdAt = user.createdAt;
    data.signingKeys = user.signingKeys;

    if (requestor && usersColl.exists(requestor)) {
      const requestorConnections = db.userConnections(requestor, "outbound");
      const requestorMemberships = db.userMemberships(requestor);
      data.mutualConnections = _.intersection(
        connections.filter(isKnown).map((c) => c.id),
        requestorConnections.filter(isKnown).map((c) => c.id)
      );
      data.mutualGroups = _.intersection(
        memberships.map((m) => m.id),
        requestorMemberships.map((m) => m.id)
      );
      const conn = requestorConnections.find((c) => c.id === id);
      if (conn) {
        data.connectedAt = conn.timestamp;
        data.level = conn.level;
      }
    }
    res.send({ data });
  },

  verificationPublicGet: function (req, res) {
    const appKey = req.param("app");
    const app = db.getApp(appKey);
    const roundedTimestamp = req.param("roundedTimestamp");
    const verification = req.param("verification");

    if (!app.verifications.includes(verification)) {
      throw new errors.UnacceptableVerification(verification, appKey);
    }

    const vel = app.verificationExpirationLength;
    const serverRoundedTimestamp = vel ? parseInt(Date.now() / vel) * vel : 0;
    if (serverRoundedTimestamp !== roundedTimestamp) {
      throw new errors.InvalidRoundedTimestampError(
        serverRoundedTimestamp,
        roundedTimestamp
      );
    }

    const info = stringify({ app: appKey, roundedTimestamp, verification });
    const server = new WISchnorrServer();
    const params = server.GenerateWISchnorrParams(info);
    const p = params.private;
    cachedParamsColl.insert({
      public: stringify(params.public),
      private: { u: p.u.toString(), s: p.s.toString(), d: p.d.toString() },
      app: appKey,
      roundedTimestamp,
      verification,
      creationDate: parseInt(Date.now() / 1000),
    });
    res.send({
      data: { public: params.public },
    });
  },

  verificationSigGet: function (req, res) {
    const id = req.param("id");
    const sig = req.param("sig");
    const e = req.param("e");
    const pub = req.param("public");

    // to enable clients that requested the signed verification using the same public before
    // but failed in receiving the response
    let sv = signedVerificationsColl.firstExample({ publicHash: hash(pub) });
    if (sv) {
      res.send({
        data: {
          response: sv.response,
        },
      });
      return;
    }

    const params = db.getCachedParams(pub);
    const app = db.getApp(params.app);
    const msg = stringify({ id, public: JSON.parse(pub) });
    operations.verifyUserSig(msg, id, sig);

    let verifications = db.userVerifications(id);
    verifications = _.keyBy(verifications, (v) => v.name);
    let verified;
    try {
      let expr = parser.parse(params.verification);
      for (let v of expr.variables()) {
        if (!verifications[v]) {
          verifications[v] = false;
        }
      }
      verified = expr.evaluate(verifications);
    } catch (err) {
      throw new errors.InvalidExpressionError(
        app.name,
        params.verification,
        err
      );
    }
    if (!verified) {
      throw new errors.NotVerifiedError(params.app, params.verification);
    }

    const conf = module.context.configuration;
    if (!(conf.wISchnorrPassword || conf.seed)) {
      throw new errors.WISchnorrPasswordNotSetError();
    }

    const server = new WISchnorrServer();
    server.GenerateSchnorrKeypair(conf.wISchnorrPassword || conf.seed);

    const q = {
      id,
      roundedTimestamp: params.roundedTimestamp,
      app: params.app,
      verification: params.verification,
    };
    sv = signedVerificationsColl.firstExample(q);
    if (sv) {
      throw new errors.DuplicateSigRequestError();
    }

    let priv = params.private;
    priv = {
      u: new BigInteger(priv.u),
      s: new BigInteger(priv.s),
      d: new BigInteger(priv.d),
    };
    const response = server.GenerateWISchnorrServerResponse(priv, e);
    // using hash of pub to reduce storage size
    q["publicHash"] = hash(pub);
    q["response"] = response;
    signedVerificationsColl.insert(q);
    res.send({
      data: {
        response,
      },
    });
  },

  verificationAppUserIdPost: function (req, res) {
    const app = req.param("app");
    const appUserId = req.param("appUserId");
    const { sig, verification, roundedTimestamp, uid } = req.body;
    const client = new WISchnorrClient(db.getState().wISchnorrPublic);
    const info = { app, verification, roundedTimestamp };
    const result = client.VerifyWISchnorrBlindSignature(
      sig,
      stringify(info),
      uid
    );
    if (!result) {
      throw new errors.InvalidSignatureError();
    }
    db.insertAppUserIdVerification(
      app,
      uid,
      appUserId,
      verification,
      roundedTimestamp
    );
  },

  verificationsGet: function (req, res) {
    const appKey = req.param("app");
    const signed = req.param("signed");
    let timestamp = req.param("timestamp");
    const includeHash = req.param("includeHash");
    const app = db.getApp(appKey);
    const pseudoVerification = req.param("pseudoVerification");
    let appUserId = req.param("appUserId");
    if (app.idsAsHex) {
      appUserId = appUserId.toLowerCase();
    }
    const appUserIdExists = appIdsColl.firstExample({
      app: appKey,
      appId: appUserId,
    });
    const development = module.context.configuration.development;
    if (!(development && pseudoVerification) && !appUserIdExists) {
      throw new errors.AppUserIdNotFoundError(appUserId);
    }

    const vel = app.verificationExpirationLength;
    const roundedTimestamp = vel ? parseInt(Date.now() / vel) * vel : 0;

    if (timestamp == "seconds") {
      timestamp = vel ? roundedTimestamp / 1000 : parseInt(Date.now() / 1000);
    } else if (timestamp == "milliseconds") {
      timestamp = vel ? roundedTimestamp : Date.now();
    } else {
      timestamp = undefined;
    }

    const results = [];
    for (let verification of app.verifications) {
      const verificationHash = crypto.sha256(verification);
      let doc;
      if (development && pseudoVerification) {
        doc = { app: appKey, appId: appUserId, verification, roundedTimestamp };
      } else {
        doc = appIdsColl.firstExample({
          app: appKey,
          appId: appUserId,
          verification,
          roundedTimestamp,
        });
      }
      const unique = doc ? true : false;
      const result = {
        unique,
        app: appKey,
        appUserId,
        verification,
        sig: "",
        timestamp,
      };
      if (includeHash) {
        result["verificationHash"] = verificationHash;
      }
      if (!doc) {
        results.push(result);
        continue;
      }

      // sign and return the verification
      let sig, publicKey;
      if (signed == "nacl") {
        const naclKeyPair = getNaclKeyPair();
        if (!naclKeyPair.privateKey) {
          throw new errors.NaclKeyNotSetError();
        }

        let message = appKey + "," + appUserId;
        if (includeHash) {
          message = message + "," + verificationHash;
        }
        if (timestamp) {
          message = message + "," + timestamp;
        }
        publicKey = naclKeyPair.publicKey;
        sig = uInt8ArrayToB64(
          Object.values(
            nacl.sign.detached(strToUint8Array(message), naclKeyPair.privateKey)
          )
        );
      } else if (signed == "eth") {
        const ethKeyPair = getEthKeyPair();
        if (!ethKeyPair.privateKey) {
          throw new errors.EthKeyNotSetError();
        }

        let message, h;
        if (app.idsAsHex) {
          message = pad32(appKey) + addressToBytes32(appUserId);
        } else {
          if (appUserId.length > 32) {
            throw new errors.UnsingableAppUserIdError(appUserId);
          }
          message = pad32(appKey) + pad32(appUserId);
        }
        message = Buffer.from(message, "binary").toString("hex");
        if (includeHash) {
          message += verificationHash;
        }
        if (timestamp) {
          const t = timestamp.toString(16);
          message += "0".repeat(64 - t.length) + t;
        }
        h = new Uint8Array(
          createKeccakHash("keccak256").update(message, "hex").digest()
        );
        publicKey = ethKeyPair.publicKey;
        const _sig = secp256k1.ecdsaSign(h, ethKeyPair.privateKey);
        sig = {
          r: Buffer.from(Object.values(_sig.signature.slice(0, 32))).toString(
            "hex"
          ),
          s: Buffer.from(Object.values(_sig.signature.slice(32, 64))).toString(
            "hex"
          ),
          v: _sig.recid + 27,
        };
      }

      result["sig"] = sig;
      result["publicKey"] = publicKey;
      results.push(result);
    }
    res.send({ data: results });
  },

  allVerificationsGet: function (req, res) {
    const appKey = req.param("app");
    const countOnly = req.param("countOnly");
    const activeOnly = req.param("activeOnly");
    const data = db.getAppUserIds(appKey, activeOnly, countOnly);
    res.send({
      data,
    });
  },

  appGet: function (req, res) {
    const appKey = req.param("app");
    let app = db.getApp(appKey);
    res.send({
      data: db.appToDic(app),
    });
  },

  allAppsGet: function (req, res) {
    const apps = db.getApps().map((app) => db.appToDic(app));
    apps.sort((app1, app2) => {
      const used1 = app1.assignedSponsorships - app1.unusedSponsorships;
      const unused1 = app1.unusedSponsorships;
      const used2 = app2.assignedSponsorships - app2.unusedSponsorships;
      const unused2 = app2.unusedSponsorships;
      return unused2 * used2 - unused1 * used1;
    });
    res.send({
      data: {
        apps,
      },
    });
  },

  stateGet: function (req, res) {
    res.send({
      data: db.getState(),
    });
  },

  groupGet: function (req, res) {
    const id = req.param("id");
    const group = db.getGroup(id);
    res.send({
      data: {
        id,
        members: db.groupMembers(id),
        invites: db.groupInvites(id),
        admins: group.admins,
        seed: group.seed || false,
        region: group.region,
        type: group.type || "general",
        url: group.url,
        info: group.info,
        timestamp: group.timestamp,
      },
    });
  },

  sponsorshipGet: function (req, res) {
    let appUserId = req.param("appUserId");
    if (db.isEthereumAddress(appUserId)) {
      appUserId = appUserId.toLowerCase();
    }
    const sponsorship = db.getSponsorship(appUserId);
    res.send({
      data: {
        app: sponsorship._to.replace("apps/", ""),
        appHasAuthorized: sponsorship.appHasAuthorized,
        spendRequested: sponsorship.spendRequested,
        timestamp: sponsorship.timestamp,
      },
    });
  },
};

router
  .post("/operations", handlers.operationsPost)
  .body(schemas.operation)
  .summary("Add an operation to be applied after consensus")
  .description("Add an operation be applied after consensus.")
  .response(schemas.operationPostResponse)
  .error(400, "Failed to add the operation")
  .error(403, "Bad signature")
  .error(429, "Too Many Requests");

router
  .get("/users/:id/memberships", handlers.userMembershipsGet)
  .pathParam(
    "id",
    joi.string().required().description("the brightid of the user")
  )
  .summary("Gets memberships of the user")
  .response(schemas.userMembershipsGetResponse);

router
  .get("/users/:id/invites", handlers.userInvitesGet)
  .pathParam(
    "id",
    joi.string().required().description("the brightid of the user")
  )
  .summary("Gets invites of the user")
  .response(schemas.userInvitesGetResponse);

router
  .get("/users/:id/verifications", handlers.userVerificationsGet)
  .pathParam(
    "id",
    joi.string().required().description("the brightid of the user")
  )
  .summary("Gets verifications of the user")
  .response(schemas.userVerificationsGetResponse);

router
  .get("/users/:id/profile", handlers.userProfileGet)
  .pathParam(
    "id",
    joi
      .string()
      .required()
      .description("the brightid of the user that info requested about")
  )
  .summary("Gets profile information of a user")
  .response(schemas.userProfileGetResponse)
  .error(404, "User not found");

router
  .get("/users/:id/profile/:requestor", handlers.userProfileGet)
  .pathParam(
    "id",
    joi
      .string()
      .required()
      .description("the brightid of the user that info requested about")
  )
  .pathParam(
    "requestor",
    joi
      .string()
      .required()
      .description("the brightid of the user that requested info")
  )
  .summary("Gets profile information of a user")
  .description(
    "Gets profile information of a user, including requestor's mutal connections/groups info"
  )
  .response(schemas.userProfileGetResponse)
  .error(404, "User not found");

router
  .get("/users/:id/connections/:direction", handlers.userConnectionsGet)
  .pathParam(
    "id",
    joi.string().required().description("the brightid of the user")
  )
  .pathParam(
    "direction",
    joi
      .string()
      .required()
      .valid("inbound", "outbound")
      .description("the direction of the connection")
  )
  .summary("Gets inbound or outbound connections of a user")
  .description("Gets user's connections with levels and timestamps")
  .response(schemas.userConnectionsGetResponse);

router
  .get("/users/:id/familiesToVouch", handlers.userFamiliesToVouchGet)
  .pathParam(
    "id",
    joi.string().required().description("the brightid of the user")
  )
  .summary("Gets family groups which the user can vouch for")
  .response(schemas.userFamiliesToVouchGetResponse);

router
  .get("/operations/:hash", handlers.operationGet)
  .pathParam(
    "hash",
    joi.string().required().description("sha256 hash of the operation message")
  )
  .summary("Gets state and result of an operation")
  .response(schemas.operationGetResponse)
  .error(404, "Operation not found");

router
  .get("/verifications/blinded/public", handlers.verificationPublicGet)
  .queryParam("app", joi.string().required().description("the key of the app"))
  .queryParam(
    "roundedTimestamp",
    joi
      .number()
      .integer()
      .required()
      .description(
        "timestamp that is rounded to app's required precision or zero"
      )
  )
  .queryParam(
    "verification",
    joi.string().required().description("custom verification expression")
  )
  .summary("Gets public part of WI-Schnorr params")
  .description(
    "Gets public part of WI-Schnorr params using deterministic json representation of {app, roundedTimestamp, verification} as info"
  )
  .response(schemas.verificationPublicGetResponse)
  .error(404, "app not found")
  .error(403, "invalid rounded timestamp");

router
  .get("/verifications/blinded/sig/:id", handlers.verificationSigGet)
  .pathParam(
    "id",
    joi
      .string()
      .required()
      .description("the brightid of the user requesting the verification")
  )
  .queryParam(
    "public",
    joi.string().required().description("public part of WI-Schnorr params")
  )
  .queryParam(
    "sig",
    joi
      .string()
      .description(
        "deterministic json representation of {id, public} signed by the user represented by id"
      )
  )
  .queryParam(
    "e",
    joi
      .string()
      .required()
      .description(
        "the e part of WI-Schnorr challenge generated by client using public provided by node"
      )
  )
  .summary("Gets WI-Schnorr server response")
  .description(
    "Gets WI-Schnorr server response that will be used by client to generate final signature to be shared with the app"
  )
  .response(schemas.verificationSigGetResponse)
  .error(404, "app not found")
  .error(403, "invalid rounded timestamp");

router
  .post("/verifications/:app/:appUserId", handlers.verificationAppUserIdPost)
  .pathParam(
    "app",
    joi.string().required().description("the app that user is verified for")
  )
  .pathParam(
    "appUserId",
    joi.string().required().description("the id of the user within the app")
  )
  .body(schemas.verificationAppUserIdPostBody)
  .summary("Posts an unblinded signature")
  .description(
    "Clients use this endpoint to add unblinded signature for an appUserId to the node to be queried by apps"
  )
  .response(null);

router
  .get("/verifications/:app/:appUserId/", handlers.verificationsGet)
  .pathParam(
    "app",
    joi.string().required().description("the app that user is verified for")
  )
  .pathParam(
    "appUserId",
    joi.string().required().description("the id of user within the app")
  )
  .queryParam(
    "signed",
    joi
      .string()
      .description(
        "the value will be eth or nacl to indicate the type of signature returned"
      )
  )
  .queryParam(
    "timestamp",
    joi
      .string()
      .description(
        'request a timestamp of the specified format to be added to the response. Accepted values: "seconds", "milliseconds"'
      )
  )
  .queryParam(
    "includeHash",
    joi
      .boolean()
      .default(true)
      .description("false if the requester doesn't want the hash included")
  )
  .queryParam(
    "pseudoVerification",
    joi
      .boolean()
      .default(false)
      .description("true if the requester wants a pseudo verification")
  )
  .summary("Gets a signed verification")
  .description(
    "Apps use this endpoint to query all signed verifications for an appUserId from the node"
  )
  .response(schemas.verificationsGetResponse)
  .error(404, "appUserId not found");

router
  .get("/verifications/:app", handlers.allVerificationsGet)
  .pathParam(
    "app",
    joi
      .string()
      .required()
      .description("the app for which the user is verified")
  )
  .queryParam(
    "activeOnly",
    joi
      .boolean()
      .default(false)
      .description(
        "true if the requester doesn't want the app generated ids whith expired rounded timestamp"
      )
  )
  .queryParam(
    "countOnly",
    joi
      .boolean()
      .default(false)
      .description(
        "true if the requester doesn't want the array of the app generated ids included"
      )
  )
  .summary("Gets array of all of app generated ids verifed for the app")
  .description(
    "Gets array of all of app generated ids that are sponsored and verified for using the app"
  )
  .response(schemas.allVerificationsGetResponse)
  .error(404, "app not found");

router
  .get("/apps/:app", handlers.appGet)
  .pathParam(
    "app",
    joi.string().required().description("Unique name of the app")
  )
  .summary("Gets information about an app")
  .response(schemas.appGetResponse)
  .error(404, "app not found");

router
  .get("/apps", handlers.allAppsGet)
  .summary("Gets all apps")
  .response(schemas.allAppsGetResponse);

router
  .get("/state", handlers.stateGet)
  .summary("Gets state of this node")
  .response(schemas.stateGetResponse);

router
  .get("/groups/:id", handlers.groupGet)
  .pathParam("id", joi.string().required().description("the id of the group"))
  .summary("Gets information about a group")
  .description(
    "Gets a group's admins, info, region, seed, type, url, timestamp, members and invited list."
  )
  .response(schemas.groupGetResponse)
  .error(404, "Group not found");

router
  .get("/sponsorships/:appUserId", handlers.sponsorshipGet)
  .pathParam(
    "appUserId",
    joi
      .string()
      .required()
      .description("the app generated id that info is requested about")
  )
  .summary("Gets sponsorship information of an app generated id")
  .response(schemas.sponsorshipGetResponse)
  .error(404, "App generated id not found");

module.context.use(function (req, res, next) {
  try {
    next();
  } catch (e) {
    if (e.cause && e.cause.isJoi) {
      e.code = 400;
      if (
        req._raw.url.includes("operations") &&
        e.cause.details &&
        e.cause.details.length > 0
      ) {
        let msg1 = "";
        const msg2 = "invalid operation name";
        e.cause.details.forEach((d) => {
          if (!d.message.includes('"name" must be one of')) {
            msg1 += `${d.message}, `;
          }
        });
        e.message = msg1 || msg2;
      }
    }
    if (!(e instanceof errors.NotFoundError)) {
      console.group("Error returned");
      console.log("url:", req._raw.requestType, req._raw.url);
      console.log("error:", e);
      console.log("body:", req.body);
      console.groupEnd();
    }
    let options = undefined;
    if (e instanceof ArangoError) {
      options = { extra: { arangoErrorNum: e.errorNum } };
      e.errorNum = errors.ARANGO_ERROR;
    }
    res.throw(e.code || 500, e, options);
  }
});

module.exports = {
  handlers,
};
