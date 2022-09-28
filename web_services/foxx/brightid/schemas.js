const joi = require("joi");

// lowest-level schemas
var schemas = {
  score: joi.number().min(0).max(5).default(0),
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
        'brightid + "|" + timestamp signed by the reported user to prove that he requested the connection'
      ),
  },
  "Add Connection": {
    id1: joi
      .string()
      .required()
      .description("brightid of the first user making the connection"),
    id2: joi
      .string()
      .required()
      .description("brightid of the second user making the connection"),
    sig1: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id1"
      ),
    sig2: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id2"
      ),
  },
  "Remove Connection": {
    id1: joi
      .string()
      .required()
      .description("brightid of the user removing the connection"),
    id2: joi
      .string()
      .required()
      .description(
        "brightid of the second user that the connection with is being removed"
      ),
    reason: joi
      .string()
      .valid("fake", "duplicate", "deceased")
      .required()
      .description(
        "the reason for removing connection specificed by the user represented by id1"
      ),
    sig1: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id1"
      ),
  },
  "Add Group": {
    group: joi.string().required().description("the unique id of the group"),
    id1: joi.string().required().description("brightid of the first founder"),
    id2: joi.string().required().description("brightid of the second founder"),
    id3: joi.string().required().description("brightid of the third founder"),
    inviteData2: joi
      .string()
      .required()
      .description(
        "the group AES key encrypted for signingKey of the user represented by id2"
      ),
    inviteData3: joi
      .string()
      .required()
      .description(
        "the group AES key encrypted for signingKey of the user represented by id3"
      ),
    url: joi
      .string()
      .required()
      .description(
        "the url that group data (profile image and name) encrypted by group AES key can be fetched from"
      ),
    type: joi
      .string()
      .valid("general", "primary")
      .required()
      .description("type of the group"),
    sig1: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the creator of group represented by id1"
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
  "Set Trusted Connections": {
    id: joi
      .string()
      .required()
      .description("brightid of the user who is setting recovery connections"),
    trusted: joi
      .array()
      .items(joi.string())
      .required()
      .description("brightid list of recovery connections"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  // this operation should be renamed to "Social Recovery" in v6
  "Set Signing Key": {
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
  "Link ContextId": {
    id: joi
      .string()
      .description(
        "brightid of the user who is linking his/her brightid to a context id"
      ),
    contextId: joi
      .string()
      .description(
        "the unique id of the user represented by brightid in the specific context"
      ),
    encrypted: joi
      .string()
      .description(
        "the json representation of `{id: id, contextId: contextId}` encrypted using an AES key shared between all nodes manage linking brightids to contextIds for a specific context. This field is not sent by clients and will be replaced by `id` and `contextId` fields before sending operation to blockchain to keep the relation of brightids to contextIds private."
      ),
    context: joi
      .string()
      .required()
      .description(
        "the context name in which the user represented by brightid is linking context id with his/her brightid"
      ),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the user represented by id"
      ),
  },
  Sponsor: {
    contextId: joi
      .string()
      .required()
      .description(
        "the contextId for the user that is being sponsored by context"
      ),
    app: joi
      .string()
      .required()
      .description("the app key that user is being sponsored by"),
    sig: joi
      .string()
      .required()
      .description(
        "deterministic json representation of operation object signed by the private key shared between context owners and trusted node operators which enable them to spend sponsorships assigned to the context"
      ),
  },
  "Spend Sponsorship": {
    contextId: joi
      .string()
      .required()
      .description("the contextId that is being sponsored"),
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
        .description("milliseconds since epoch when the operation created"),
      v: joi.number().required().valid(5).description("version of API"),
    }
  );
});

// extend lower-level schemas with higher-level schemas
schemas = Object.assign(
  {
    user: joi.object({
      id: joi.string().required().description("the user id"),
      // this will be replaced by signingKeys on v6
      signingKey: joi
        .string()
        .required()
        .description("the first signingKey of the user"),
      score: schemas.score,
      level: joi
        .string()
        .required()
        .description("the confidence level set on this user"),
      verifications: joi.array().items(joi.string()),
      hasPrimaryGroup: joi
        .boolean()
        .description("true if user has primary group"),
      trusted: joi
        .array()
        .items(joi.string())
        .description("list of recovery connections of the user"),
      flaggers: joi
        .object()
        .description(
          "an object containing ids of flaggers as key and reason as value"
        ),
      createdAt: schemas.timestamp
        .required()
        .description("the user creation timestamp"),
    }),
    connection: joi.object({
      id: joi.string().required().description("the brightid of the connection"),
      level: joi.string().required().description("the level of the connection"),
      timestamp: schemas.timestamp
        .required()
        .description("the timestamp of the connection"),
    }),
    groupBase: joi.object({
      id: joi.string().required().description("unique identifier of the group"),
      members: joi
        .array()
        .items(joi.string())
        .required()
        .description("brightids of group members"),
      type: joi
        .string()
        .required()
        .description('type of group which is "primary" or "general"'),
      founders: joi
        .array()
        .items(joi.string())
        .required()
        .description("brightids of group founders"),
      admins: joi
        .array()
        .items(joi.string())
        .required()
        .description("brightids of group admins"),
      isNew: joi
        .boolean()
        .required()
        .description(
          "true if some of founders did not join the group yet and group is still in founding stage"
        ),
      // score on group is deprecated and will be removed on v6
      score: schemas.score,
      url: joi
        .string()
        .required()
        .description("url of encrypted group data (name and photo)"),
      timestamp: schemas.timestamp
        .required()
        .description("group creation timestamp"),
    }),
    app: joi.object({
      id: joi.string().required().description("unique app id"),
      name: joi.string().required().description("app name"),
      context: joi.string().required().description("app context"),
      verification: joi
        .string()
        .required()
        .description("verification required for using the app"),
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
      testing: joi
        .boolean()
        .required()
        .description("true if the app is in the testing mode"),
      soulbound: joi
        .boolean()
        .required()
        .description("true if the app uses soulbound standard"),
      soulboundMessage: joi
        .string()
        .required()
        .description("a static message to be signed at linking time by the context id"),
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

schemas = Object.assign(
  {
    group: schemas.groupBase.keys({
      joined: schemas.timestamp
        .required()
        .description("timestamp when the user joined"),
    }),

    invite: schemas.groupBase.keys({
      inviteId: joi
        .string()
        .required()
        .description("unique identifier of invite"),
      invited: schemas.timestamp
        .required()
        .description("timestamp when the user was invited"),
      inviter: joi.string().required().description("brightid of inviter"),
      data: joi
        .string()
        .required()
        .description(
          "encrypted version of the AES key that group name and photo uploaded to `url` encrypted with" +
            "invitee should first decrypt this data with his/her signingKey and then fetch data in `url` and decrypt that using the AES key"
        ),
    }),
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

    userGetResponse: joi.object({
      data: joi.object({
        score: schemas.score,
        createdAt: schemas.timestamp.required(),
        groups: joi.array().items(schemas.group),
        invites: joi.array().items(schemas.invite),
        connections: joi.array().items(schemas.user),
        verifications: joi.array().items(joi.string()),
        isSponsored: joi.boolean(),
        trusted: joi.array().items(joi.string()),
        flaggers: joi
          .object()
          .description(
            "an object containing ids of flaggers as key and reason as value"
          ),
        signingKeys: joi
          .array()
          .items(joi.string())
          .required()
          .description(
            "list of signing keys that user can sign operations with"
          ),
      }),
    }),

    userConnectionsGetResponse: joi.object({
      data: joi.object({
        connections: joi.array().items(schemas.connection),
      }),
    }),

    userVerificationsGetResponse: joi.object({
      data: joi.object({
        verifications: joi.array().items(joi.object()),
      }),
    }),

    userProfileGetResponse: joi.object({
      data: joi.object({
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
        mutualConnections: joi
          .array()
          .items(joi.string())
          .required()
          .description("brightids of mutual connections"),
        mutualGroups: joi
          .array()
          .items(joi.string())
          .required()
          .description("ids of mutual groups"),
        connectedAt: schemas.timestamp
          .required()
          .description("timestamp of last connection"),
        createdAt: schemas.timestamp
          .required()
          .description("creation time of user specified by id"),
        reports: joi
          .array()
          .items(
            joi.object({
              id: joi.string().required().description("brightid of reporter"),
              reportReason: joi
                .string()
                .required()
                .description("the reason of reporting"),
            })
          )
          .description("list of reports for the user specified by id"),
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

    verificationGetResponse: joi.object({
      data: joi.object({
        unique: joi.string().description("true if user is verified for an app"),
        app: joi.string().description("the key of app"),
        context: joi.string().description("the context name"),
        contextIds: joi
          .array()
          .items(joi.string())
          .description(
            "list of all contextIds this user linked from most recent to oldest including current active contextId as first member"
          ),
        timestamp: schemas.timestamp.description(
          "timestamp of the verification if a timestamp was requested by including a 'timestamp' parameter"
        ),
        sig: joi
          .string()
          .description("verification message signed by the node"),
        publicKey: joi.string().description("the node's public key"),
      }),
    }),

    allVerificationsGetResponse: joi.object({
      data: joi.object({
        contextIds: joi
          .array()
          .items(joi.string())
          .description("an array of contextIds"),
      }),
    }),

    ipGetResponse: joi.object({
      data: joi.object({
        ip: joi.string().description("IPv4 address in dot-decimal notation."),
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
        version: joi.string().required().description("version of this node"),
      }),
    }),

    contextDumpGetResponse: joi.object({
      data: joi.object({
        collection: joi
          .string()
          .required()
          .description(
            "the collection name used to store contextIds linked under the context"
          ),
        idsAsHex: joi
          .boolean()
          .required()
          .description("true if contextIds are hex strings"),
        linkAESKey: joi
          .string()
          .required()
          .description(
            "the AES key used to encrypt links before sending to IDChain and decrypt after receiving them"
          ),
        contextIds: joi
          .array()
          .required()
          .items(joi.string())
          .description("list of all contextIds linked under the context"),
      }),
    }),

    groupGetResponse: joi.object({
      data: joi.object({
        members: joi
          .array()
          .items(joi.string())
          .required()
          .description("brightids of members of the group"),
        invites: joi
          .array()
          .items(
            joi.object({
              inviter: joi
                .string()
                .required()
                .description("brightid of inviter"),
              invitee: joi
                .string()
                .required()
                .description("brightid of invitee"),
              id: joi.string().required().description("unique id of invite"),
              data: joi
                .string()
                .required()
                .description("AES key of group encrypted for invitee"),
              timestamp: joi
                .number()
                .required()
                .description("timestamp of invite"),
            })
          )
          .required(),
        eligibles: joi
          .array()
          .items(joi.string())
          .required()
          .description(
            "brightids of the users that are eligible to join the group"
          ),
        admins: joi
          .array()
          .items(joi.string())
          .required()
          .description("brightids of admins of the group"),
        founders: joi
          .array()
          .items(joi.string())
          .required()
          .description("brightids of founders of the group"),
        isNew: joi.boolean().required().description("true if group is new"),
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
            "true if the app authorized the node to use sponsorships for this contextId"
          ),
        spendRequested: joi
          .boolean()
          .required()
          .description(
            "true if the client requested to spend sponsorship for this contextId"
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
