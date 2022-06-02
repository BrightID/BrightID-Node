const joi = require("joi");

// lowest-level schemas
var schemas = {
  timestamp: joi.number().integer(),
};

const operations = {
  Connect: {
    id1: joi
      .string()
      .required()
      .description("brightid of the user making the directed connection"),
    id2: joi
      .string()
      .required()
      .description("brightid of the target of the directed connection"),
    sig1: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id1"
      ),
    level: joi
      .string()
      .valid("reported", "suspicious", "just met", "already known", "recovery")
      .required()
      .description("level of confidence"),
    reportReason: joi
      .string()
      .valid("spammer", "fake", "duplicate", "deceased", "replaced", "other")
      .description(
        "for reported level, the reason for reporting the user specificed by id2"
      ),
    replacedWith: joi
      .string()
      .description(
        "for reported as replaced, the new brightid of the replaced account"
      ),
    requestProof: joi
      .string()
      .description(
        "brightid + | + timestamp signed by the reported user to prove that he requested the connection"
      ),
  },
  "Add Group": {
    group: joi.string().required().description("the unique id of the group"),
    id: joi.string().required().description("brightid of the group founder"),
    url: joi
      .string()
      .required()
      .description(
        "the url that group data (profile image and name) encrypted by group AES key can be fetched from"
      ),
    type: joi
      .string()
      .valid("general", "family")
      .required()
      .description("type of the group"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the founder of the group represented by id"
      ),
  },
  "Remove Group": {
    id: joi
      .string()
      .required()
      .description("brightid of the group admin who want to remove the group"),
    group: joi.string().required().description("the unique id of the group"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id1"
      ),
  },
  "Add Membership": {
    id: joi
      .string()
      .required()
      .description("brightid of the user wants to join the group"),
    group: joi
      .string()
      .required()
      .description(
        "the unique id of the group that the user represented by id wants to join"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Remove Membership": {
    id: joi
      .string()
      .required()
      .description("brightid of the user wants to leave the group"),
    group: joi
      .string()
      .required()
      .description(
        "the unique id of the group that the user represented by id wants to leave"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Social Recovery": {
    id: joi
      .string()
      .required()
      .description(
        "brightid of the user who is resetting signingKeys by social recovery"
      ),
    signingKey: joi
      .string()
      .required()
      .description(
        "the public key of the new key pair that user will use to sign operations with"
      ),
    id1: joi
      .string()
      .required()
      .description(
        "brightid of a recovery connection of the user represented by id"
      ),
    id2: joi
      .string()
      .required()
      .description(
        "brightid of a recovery connection of the user represented by id"
      ),
    sig1: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the recovery connection represented by id1"
      ),
    sig2: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the recovery connection represented by id2"
      ),
  },
  Sponsor: {
    appUserId: joi
      .string()
      .required()
      .description("the app generated id that is being sponsored"),
    app: joi
      .string()
      .required()
      .description("the app key that user is being sponsored by"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the app keypair"
      ),
  },
  "Spend Sponsorship": {
    appUserId: joi
      .string()
      .required()
      .description("the app generated id that is being sponsored"),
    app: joi
      .string()
      .required()
      .description("the app key that user is being sponsored by"),
  },
  Invite: {
    inviter: joi
      .string()
      .required()
      .description(
        "brightid of the user who has admin rights in the group and can invite others to the group"
      ),
    invitee: joi
      .string()
      .required()
      .description("brightid of the user whom is invited to the group"),
    group: joi
      .string()
      .required()
      .description(
        "the unique id of the group that invitee is being invited to"
      ),
    data: joi
      .string()
      .required()
      .description("the group AES key encrypted for signingKey of the invitee"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the inviter"
      ),
  },
  Dismiss: {
    dismisser: joi
      .string()
      .required()
      .description(
        "brightid of the user who has admin rights in the group and can dismiss others from the group"
      ),
    dismissee: joi
      .string()
      .required()
      .description("brightid of the user whom is dismissed from the group"),
    group: joi
      .string()
      .required()
      .description(
        "the unique id of the group that dismissee is being dismissed from"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the dismisser"
      ),
  },
  "Add Admin": {
    id: joi
      .string()
      .required()
      .description("brightid of one of the current admins of the group"),
    admin: joi
      .string()
      .required()
      .description(
        "brightid of the member whom is being granted administratorship of the group"
      ),
    group: joi.string().required().description("the unique id of the group"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the admin user represented by id"
      ),
  },
  "Update Group": {
    id: joi
      .string()
      .required()
      .description("brightid of one of the admins of the group"),
    group: joi.string().required().description("the unique id of the group"),
    url: joi
      .string()
      .required()
      .description(
        "the new url that group data (profile image and name) encrypted by group AES key can be fetched from"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Add Signing Key": {
    id: joi
      .string()
      .required()
      .description("brightid of the user who is adding new signingKey"),
    signingKey: joi
      .string()
      .required()
      .description(
        "the public key of the new key pair that user can sign operations with"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Remove Signing Key": {
    id: joi
      .string()
      .required()
      .description("brightid of the user who is removing the signingKey"),
    signingKey: joi
      .string()
      .required()
      .description("the signingKey that is being removed"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Remove All Signing Keys": {
    id: joi
      .string()
      .required()
      .description(
        "brightid of the user who is removing all the signingKeys except the one that used to sign this operation"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Vouch Family": {
    id: joi
      .string()
      .required()
      .description("brightid of the user who is vouching the family group"),
    group: joi.string().required().description("the unique id of the group"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  "Set Family Head": {
    id: joi
      .string()
      .required()
      .description("brightid of one of the current admins of the group"),
    head: joi
      .string()
      .required()
      .description(
        "brightid of the member who is being granted the leadership of the family group"
      ),
    group: joi
      .string()
      .required()
      .description("the unique id of the family group"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the head user represented by id"
      ),
  },
  "Convert To Family": {
    id: joi
      .string()
      .required()
      .description("brightid of one of the current admins of the group"),
    head: joi
      .string()
      .required()
      .description(
        "brightid of the member who is being granted the leadership of the family group"
      ),
    group: joi
      .string()
      .required()
      .description("the unique id of the family group"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the head user represented by id"
      ),
  },
};

Object.keys(operations).forEach((name) => {
  operations[name] = Object.assign(
    {
      name: joi.string().valid(name).required().description("operation name"),
    },
    operations[name],
    {
      timestamp: joi
        .number()
        .required()
        .description(
          "the timestamp (milliseconds since epoch) when the operation was created"
        ),
      v: joi.number().required().valid(6).description("API version"),
    }
  );
});

// extend lower-level schemas with higher-level schemas
schemas = Object.assign(
  {
    connection: joi.object({
      id: joi.string().required().description("the brightid of the connection"),
      level: joi.string().required().description("the level of the connection"),
      timestamp: schemas.timestamp
        .required()
        .description("the timestamp of the connection"),
      reportReason: joi
        .string()
        .valid("spammer", "fake", "duplicate", "deceased", "replaced", "other")
        .description("for reported level, the reason for reporting"),
    }),
    invite: joi.object({
      id: joi.string().required().description("unique identifier of invite"),
      group: joi
        .string()
        .required()
        .description(
          "unique identifier of the group that invitee is invited to"
        ),
      inviter: joi.string().required().description("brightid of inviter"),
      invitee: joi.string().required().description("brightid of invitee"),
      timestamp: schemas.timestamp
        .required()
        .description("timestamp when the user was invited"),
      data: joi
        .string()
        .required()
        .description(
          "encrypted version of the AES key that group name and photo uploaded to `url` encrypted with" +
            "invitee should first decrypt this data with his/her signingKey and then fetch data in `url` and decrypt that using the AES key"
        ),
    }),
    app: joi.object({
      id: joi.string().required().description("unique app id"),
      name: joi.string().required().description("app name"),
      context: joi.string().description("the context of legacy apps"),
      verification: joi
        .string()
        .required()
        .description("verification required for using the app"),
      verifications: joi
        .array()
        .items(
          joi.string().description("verification required for using the app")
        ),
      verificationUrl: joi
        .string()
        .required()
        .description("the url to PUT a verification with /:id"),
      logo: joi.string().description("app logo (base64 encoded image)"),
      url: joi.string().description("the base url for the app"),
      assignedSponsorships: joi
        .number()
        .integer()
        .description("number of assigned sponsorships"),
      unusedSponsorships: joi
        .number()
        .integer()
        .description("number of unused sponsorships"),
      testing: joi.boolean().description("true if app is in testing mode"),
      idsAsHex: joi
        .boolean()
        .description(
          "true if app generated ids are in ethereum address format"
        ),
      usingBlindSig: joi
        .boolean()
        .description("true if app is using blind signature integration"),
      verificationExpirationLength: joi
        .number()
        .integer()
        .description("app verification expiration length in milliseconds"),
      sponsorPublicKey: joi
        .string()
        .description(
          "the public part of the key pair that the app uses to sign sponsor requests"
        ),
      nodeUrl: joi
        .string()
        .description(
          "the url of the node that the app uses to query verification from"
        ),
      soulbound: joi
        .boolean()
        .required()
        .description("true if the app uses soulbound standard"),
      callbackUrl: joi.string().description("the callback url of the app"),
    }),
    recoveryConnection: joi.object({
      id: joi
        .string()
        .required()
        .description("brightid of recovery connection"),
      isActive: joi
        .boolean()
        .description("true if recovery connection active now"),
      activeAfter: joi
        .number()
        .required()
        .description("milliseconds until activation"),
      activeBefore: joi
        .number()
        .required()
        .description("milliseconds until inactivation"),
    }),
    report: joi.object({
      id: joi.string().required().description("brightid of the reporter"),
      reason: joi
        .string()
        .required()
        .valid("spammer", "fake", "duplicate", "deceased", "replaced", "other")
        .description("the reason for reporting"),
    }),
    membership: joi.object({
      id: joi.string().required().description("the id of the group"),
      timestamp: schemas.timestamp
        .required()
        .description("the timestamp when user joined the group"),
    }),
  },
  schemas
);

schemas = Object.assign(
  {
    operation: joi
      .alternatives()
      .try(
        Object.keys(operations).map((name) =>
          joi.object(operations[name]).label(name)
        )
      )
      .description(
        "Send operations to idchain to be applied to BrightID nodes' databases after consensus"
      ),
  },
  schemas
);

// extend lower-level schemas with higher-level schemas
schemas = Object.assign(
  {
    operationPostResponse: joi.object({
      data: joi.object({
        hash: joi
          .string()
          .required()
          .description(
            "sha256 hash of the operation message used for generating signature"
          ),
      }),
    }),

    userMembershipsGetResponse: joi.object({
      data: joi.object({
        memberships: joi.array().items(schemas.membership),
      }),
    }),

    userInvitesGetResponse: joi.object({
      data: joi.object({
        invites: joi.array().items(schemas.invite),
      }),
    }),

    userConnectionsGetResponse: joi.object({
      data: joi.object({
        connections: joi.array().items(schemas.connection),
      }),
    }),

    userFamiliesToVouchGetResponse: joi.object({
      data: joi.object({
        families: joi.array().items(joi.string()),
      }),
    }),

    userVerificationsGetResponse: joi.object({
      data: joi.object({
        verifications: joi.array().items(joi.object()),
      }),
    }),

    userProfileGetResponse: joi.object({
      data: joi.object({
        id: joi.string().description("brightid of the queried user"),
        connectionsNum: joi
          .number()
          .integer()
          .required()
          .description(
            "number of connections with already known or recovery level"
          ),
        groupsNum: joi
          .number()
          .integer()
          .required()
          .description("number of groups"),
        createdAt: schemas.timestamp
          .required()
          .description("creation time of the user specified by id"),
        reports: joi
          .array()
          .items(schemas.report)
          .required()
          .description(
            "list of reporters of the user with the reason for each report"
          ),
        verifications: joi
          .array()
          .items(joi.object())
          .required()
          .description(
            "list of verification objects user has with properties each verification has"
          ),
        signingKeys: joi
          .array()
          .items(joi.string())
          .required()
          .description(
            "list of signing keys that user can sign operations with"
          ),
        recoveryConnections: joi
          .array()
          .items(schemas.recoveryConnection)
          .required()
          .description("list of recovery connections for the user"),
        sponsored: joi.boolean().required().description("if user is sponsored"),
        mutualConnections: joi
          .array()
          .items(joi.string())
          .description("brightids of mutual connections"),
        mutualGroups: joi
          .array()
          .items(joi.string())
          .description("ids of mutual groups"),
        level: joi
          .string()
          .valid(
            "reported",
            "suspicious",
            "just met",
            "already known",
            "recovery"
          )
          .description(
            "level of the connection from requestor to the user specified by id"
          ),
        connectedAt: schemas.timestamp.description(
          "timestamp of the last connection from requestor to the user specified by id"
        ),
      }),
    }),

    operationGetResponse: joi.object({
      data: joi.object({
        state: joi
          .string()
          .valid("init", "sent", "applied", "failed")
          .description("state of operation"),
        result: joi
          .string()
          .description(
            "result of operation after being applied. If operation is failed this field contain the reason."
          ),
      }),
    }),

    appGetResponse: joi.object({
      data: schemas.app,
    }),

    allAppsGetResponse: joi.object({
      data: joi.object({
        apps: joi.array().items(schemas.app),
      }),
    }),

    stateGetResponse: joi.object({
      data: joi.object({
        lastProcessedBlock: joi
          .number()
          .integer()
          .required()
          .description("last block that consensus receiver service processed"),
        verificationsBlock: joi
          .number()
          .integer()
          .required()
          .description(
            "the block that scorer service updated verifications based on operations got applied before that block"
          ),
        initOp: joi
          .number()
          .integer()
          .required()
          .description("number of operations in the init state"),
        sentOp: joi
          .number()
          .integer()
          .required()
          .description("number of operations in the sent state"),
        verificationsHashes: joi
          .array()
          .items(joi.object())
          .required()
          .description("different verifications' hashes for last 2 snapshots"),
        wISchnorrPublic: joi
          .string()
          .required()
          .description(
            "the public part of WI-Schnorr params that should be used by client to generate challenge"
          ),
        ethSigningAddress: joi
          .string()
          .required()
          .description(
            "the ethereum address of this node; used for signing verifications"
          ),
        naclSigningKey: joi
          .string()
          .required()
          .description(
            "nacl signing key of this node; used for signing verifications"
          ),
        consensusSenderAddress: joi
          .string()
          .required()
          .description(
            "the ethereum address of consensus sender service of this node; used for sending operations"
          ),
        development: joi
          .boolean()
          .required()
          .description("true if the node is in development mode"),
        version: joi.string().required().description("version of this node"),
      }),
    }),

    groupGetResponse: joi.object({
      data: joi.object({
        id: joi.string().required().description("the unique id of the group"),
        members: joi
          .array()
          .items(joi.string())
          .required()
          .description("brightids of members of the group"),
        invites: joi.array().items(schemas.invite).required(),
        admins: joi
          .array()
          .items(joi.string())
          .required()
          .description("brightids of admins of the group"),
        seed: joi.boolean().required().description("true if group is Seed"),
        region: joi.string().description("region of the group"),
        type: joi.string().required().description("type of the group"),
        url: joi.string().required().description("url of the group"),
        info: joi
          .string()
          .description("URL of a documnet that contains info about the group"),
        timestamp: joi
          .number()
          .required()
          .description("the group creation timestamp"),
      }),
    }),

    verificationPublicGetResponse: joi.object({
      data: joi.object({
        public: joi
          .string()
          .required()
          .description(
            "the public part of WI-Schnorr params that should be used by client to generate challenge"
          ),
      }),
    }),

    verificationSigGetResponse: joi.object({
      data: joi.object({
        response: joi
          .string()
          .description(
            "WI-Schnorr server response that will be used by client to generate final signature"
          ),
      }),
    }),

    verificationAppUserIdPostBody: joi.object({
      uid: joi
        .string()
        .required()
        .description(
          "uid generated by client per app per expiration period and blind signed by node"
        ),
      sig: joi
        .object({
          rho: joi.string().required(),
          omega: joi.string().required(),
          sigma: joi.string().required(),
          delta: joi.string().required(),
        })
        .required()
        .description("unblinded sig"),
      verification: joi
        .string()
        .required()
        .description("verification required for using the app"),
      roundedTimestamp: joi
        .number()
        .integer()
        .required()
        .description("timestamp that is rounded to app's required precision"),
    }),

    verificationsGetResponse: joi.object({
      data: joi.array().items(
        joi.object({
          unique: joi
            .boolean()
            .required()
            .description("true if the user is unique under given app"),
          app: joi.string().required().description("unique id of the app"),
          appUserId: joi
            .string()
            .required()
            .description("the id of the user within the app"),
          verification: joi
            .string()
            .required()
            .description("verification expression"),
          verificationHash: joi
            .string()
            .description("sha256 of the verification expression"),
          timestamp: schemas.timestamp.description(
            "timestamp of the verification if a timestamp was requested"
          ),
          sig: joi
            .string()
            .description("verification message signed by the node"),
          publicKey: joi.string().description("the node's public key"),
        })
      ),
    }),

    allVerificationsGetResponse: joi.object({
      data: joi.array().items(
        joi.object({
          verification: joi
            .string()
            .required()
            .description("the verification expression"),
          appUserIds: joi
            .array()
            .items(
              joi.string().description("the id of the user within the app")
            ),
          count: joi
            .number()
            .required()
            .description(
              "the number of app generated ids"
            ),
        })
      ),
    }),

    sponsorshipGetResponse: joi.object({
      data: joi.object({
        app: joi
          .string()
          .required()
          .description("the app key that user is being sponsored by"),
        appHasAuthorized: joi
          .boolean()
          .required()
          .description(
            "true if the app authorized the node to use sponsorships for this app-generated id"
          ),
        spendRequested: joi
          .boolean()
          .required()
          .description(
            "true if the client requested to spend sponsorship for this app-generated id"
          ),
        timestamp: joi
          .number()
          .required()
          .description("the sponsorship timestamp"),
      }),
    }),
  },
  schemas
);

module.exports = {
  schemas,
  operations,
};
