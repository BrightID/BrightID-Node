const joi = require('joi');

// lowest-level schemas
var schemas = {
  timestamp: joi.number().integer(),
};

const operations = {
  'Connect': {
    id1: joi.string().required().description('brightid of the user making the directed connection'),
    id2: joi.string().required().description('brightid of the target of the directed connection'),
    sig1: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id1'),
    level: joi.string().valid('reported', 'suspicious', 'just met', 'already known', 'recovery').required().description('level of confidence'),
    reportReason: joi.string().valid('spammer', 'fake', 'duplicate', 'deceased', 'replaced', 'other').description('for reported level, the reason for reporting the user specificed by id2'),
    replacedWith: joi.string().description('for reported as replaced, the new brightid of the replaced account'),
    requestProof: joi.string().description('brightid + "|" + timestamp signed by the reported user to prove that he requested the connection'),
  },
  'Add Group': {
    group: joi.string().required().description('the unique id of the group'),
    id1: joi.string().required().description('brightid of the first founder'),
    url: joi.string().required().description('the url that group data (profile image and name) encrypted by group AES key can be fetched from'),
    type: joi.string().valid('general', 'family').required().description('type of the group'),
    sig1: joi.string().required().description('deterministic json representation of operation object signed by the creator of group represented by id1'),
  },
  'Remove Group': {
    id: joi.string().required().description('brightid of the group admin who want to remove the group'),
    group: joi.string().required().description('the unique id of the group'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id1'),
  },
  'Add Membership': {
    id: joi.string().required().description('brightid of the user wants to join the group'),
    group: joi.string().required().description('the unique id of the group that the user represented by id wants to join'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Remove Membership': {
    id: joi.string().required().description('brightid of the user wants to leave the group'),
    group: joi.string().required().description('the unique id of the group that the user represented by id wants to leave'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Social Recovery': {
    id: joi.string().required().description('brightid of the user who is resetting signingKeys by social recovery'),
    signingKey: joi.string().required().description('the public key of the new key pair that user will use to sign operations with'),
    id1: joi.string().required().description('brightid of a recovery connection of the user represented by id'),
    id2: joi.string().required().description('brightid of a recovery connection of the user represented by id'),
    sig1: joi.string().required().description('deterministic json representation of operation object signed by the recovery connection represented by id1'),
    sig2: joi.string().required().description('deterministic json representation of operation object signed by the recovery connection represented by id2'),
  },
  'Sponsor': {
    id: joi.string().required().description('the brightid of the user that is being sponsored'),
    app: joi.string().required().description('the app name that user is being sponsored by'),
    sig: joi.string().required().description("unblinded signature of Chaum's blind signature schema using deterministic json representation of {id, app} as message"),
  },
  'Invite': {
    inviter: joi.string().required().description('brightid of the user who has admin rights in the group and can invite others to the group'),
    invitee: joi.string().required().description('brightid of the user whom is invited to the group'),
    group: joi.string().required().description('the unique id of the group that invitee is being invited to'),
    data: joi.string().required().description('the group AES key encrypted for signingKey of the invitee'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the inviter'),
  },
  'Dismiss': {
    dismisser: joi.string().required().description('brightid of the user who has admin rights in the group and can dismiss others from the group'),
    dismissee: joi.string().required().description('brightid of the user whom is dismissed from the group'),
    group: joi.string().required().description('the unique id of the group that dismissee is being dismissed from'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the dismisser'),
  },
  'Add Admin': {
    id: joi.string().required().description('brightid of one of the current admins of the group'),
    admin: joi.string().required().description('brightid of the member whom is being granted administratorship of the group'),
    group: joi.string().required().description('the unique id of the group'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the admin user represented by id'),
  },
  'Update Group': {
    id: joi.string().required().description('brightid of one of the admins of the group'),
    group: joi.string().required().description('the unique id of the group'),
    url: joi.string().required().description('the new url that group data (profile image and name) encrypted by group AES key can be fetched from'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Add Signing Key': {
    id: joi.string().required().description('brightid of the user who is adding new signingKey'),
    signingKey: joi.string().required().description('the public key of the new key pair that user can sign operations with'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Remove Signing Key': {
    id: joi.string().required().description('brightid of the user who is removing the signingKey'),
    signingKey: joi.string().required().description('the signingKey that is being removed'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Remove All Signing Keys': {
    id: joi.string().required().description('brightid of the user who is removing all the signingKeys except the one that used to sign this operation'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Vouch Family Group': {
    id: joi.string().required().description('brightid of the user who is vouching the family group'),
    group: joi.string().required().description('the unique id of the group'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
  },
  'Transfer Family Head': {
    id: joi.string().required().description('brightid of the current head of the family group'),
    head: joi.string().required().description('brightid of the member who is being granted the leadership of the family group'),
    group: joi.string().required().description('the unique id of the family group'),
    sig: joi.string().required().description('deterministic json representation of operation object signed by the head user represented by id'),
  },
};

Object.keys(operations).forEach(name => {
  operations[name] = Object.assign({
    name: joi.string().valid(name).required().description('operation name'),
  }, operations[name], {
    timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
    v: joi.number().required().valid(6).description('version of API')
  });
});

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  user: joi.object({
    id: joi.string().required().description('the user id'),
    signingKeys: joi.string().required().description('signingKeys of the user'),
    level: joi.string().required().description('the confidence level set on this user'),
    verifications: joi.array().items(joi.string()),
    hasPrimaryGroup: joi.boolean().description('true if user has primary group'),
    recoveryConnections: joi.array().items(joi.string()).description('list of recovery connections of the user'),
    reporters: joi.object().description('an object containing ids of reporters as key and reason as value'),
    createdAt: schemas.timestamp.required().description('the user creation timestamp'),
  }),
  connection: joi.object({
    id: joi.string().required().description('the brightid of the connection'),
    level: joi.string().required().description('the level of the connection'),
    timestamp: schemas.timestamp.required().description('the timestamp of the connection'),
  }),
  groupBase: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    members: joi.array().items(joi.string()).required().description('brightids of group members'),
    type: joi.string().required().description('type of group which is "primary" or "general"'),
    admins: joi.array().items(joi.string()).required().description('brightids of group admins'),
    url: joi.string().required().description('url of encrypted group data (name and photo)'),
    timestamp: schemas.timestamp.required().description('group creation timestamp'),
  }),
  app: joi.object({
    id: joi.string().required().description('unique app id'),
    name: joi.string().required().description('app name'),
    verification: joi.string().required().description('verification required for using the app'),
    verificationUrl: joi.string().required().description('the url to PUT a verification with /:id'),
    logo: joi.string().description('app logo (base64 encoded image)'),
    url: joi.string().description('the base url for the app'),
    assignedSponsorships: joi.number().integer().description('number of assigned sponsorships'),
    unusedSponsorships: joi.number().integer().description('number of unused sponsorships'),
    testing: joi.boolean().description('true of app is in testing mode'),
    idsAsHex: joi.boolean().description('true if app ids are in ethereum address format'),
    usingBlindSig: joi.boolean().description('true if app is using blind signature integration'),
  }),
}, schemas);

schemas = Object.assign({
  operation: joi.alternatives().try(
    Object.keys(operations).map(
      name => joi.object(operations[name]).label(name)
    )
  ).description('Send operations to idchain to be applied to BrightID nodes\' databases after consensus')
}, schemas);

schemas = Object.assign({

  group: schemas.groupBase.keys({
    joined: schemas.timestamp.required().description('timestamp when the user joined'),
  }),

  invite: schemas.groupBase.keys({
    inviteId: joi.string().required().description('unique identifier of invite'),
    invited: schemas.timestamp.required().description('timestamp when the user was invited'),
    inviter: joi.string().required().description('brightid of inviter'),
    data: joi.string().required().description('encrypted version of the AES key that group name and photo uploaded to `url` encrypted with' + 
      'invitee should first decrypt this data with his/her signingKey and then fetch data in `url` and decrypt that using the AES key'),
  }),
}, schemas);

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  operationPostResponse: joi.object({
    data: joi.object({
      hash: joi.string().required().description("sha256 hash of the operation message used for generating signature"),
    })
  }),

  userGetResponse: joi.object({
    data: joi.object({
      createdAt: schemas.timestamp.required(),
      groups: joi.array().items(schemas.group),
      invites: joi.array().items(schemas.invite),
      connections: joi.array().items(schemas.user),
      verifications: joi.array().items(joi.string()),
      isSponsored: joi.boolean(),
      recoveryConnections: joi.array().items(joi.string()),
      reporters: joi.object().description("an object containing ids of flaggers as key and reason as value"),
      signingKeys: joi.array().items(joi.string()).required().description('list of signing keys that user can sign operations with'),
    })
  }),

  userConnectionsGetResponse: joi.object({
    data: joi.object({
      connections: joi.array().items(schemas.connection)
    })
  }),

  userEligibleGroupsToVouchGetResponse: joi.object({
    data: joi.object({
      groups: joi.array().items(joi.string())
    })
  }),

  userVerificationsGetResponse: joi.object({
    data: joi.object({
      verifications: joi.array().items(joi.object())
    })
  }),

  userProfileGetResponse: joi.object({
    data: joi.object({
      connectionsNum: joi.number().integer().required().description('number of connections with already known or recovery level'),
      groupsNum: joi.number().integer().required().description('number of groups'),
      mutualConnections: joi.array().items(joi.string()).required().description('brightids of mutual connections'),
      mutualGroups: joi.array().items(joi.string()).required().description('ids of mutual groups'),
      connectedAt: schemas.timestamp.required().description('timestamp of last connection'),
      createdAt: schemas.timestamp.required().description('creation time of user specified by id'),
      reports: joi.array().items(joi.object({
        id: joi.string().required().description('brightid of reporter'),
        reportReason: joi.string().required().description('the reason of reporting'),
      })).description('list of reports for the user specified by id'),
      verifications: joi.array().items(joi.object()).required().description('list of verification objects user has with properties each verification has'),
      signingKeys: joi.array().items(joi.string()).required().description('list of signing keys that user can sign operations with'),
    })
  }),

  operationGetResponse: joi.object({
    data: joi.object({
      state: joi.string().valid("init", "sent", "applied", "failed").description("state of operation"),
      result: joi.string().description("result of operation after being applied. If operation is failed this field contain the reason.")
    })
  }),

  ipGetResponse: joi.object({
    data: joi.object({
      ip: joi.string().description("IPv4 address in dot-decimal notation.")
    })
  }),

  appGetResponse: joi.object({
    data: schemas.app
  }),

  allAppsGetResponse: joi.object({
    data: joi.object({
      apps: joi.array().items(schemas.app)
    })
  }),

  stateGetResponse: joi.object({
    data: joi.object({
      lastProcessedBlock: joi.number().integer().required().description('last block that consensus receiver service processed'),
      verificationsBlock: joi.number().integer().required().description('the block that scorer service updated verifications based on operations got applied before that block'),
      initOp: joi.number().integer().required().description('number of operations in the init state'),
      sentOp: joi.number().integer().required().description('number of operations in the sent state'),
      verificationsHashes: joi.array().items(joi.object()).required().description("different verifications' hashes for last 2 snapshots"),
    })
  }),

  groupGetResponse: joi.object({
    data: joi.object({
      members: joi.array().items(joi.string()).required().description('brightids of members of the group'),
      invites: joi.array().items(joi.object({
        inviter: joi.string().required().description('brightid of inviter'),
        invitee: joi.string().required().description('brightid of invitee'),
        id: joi.string().required().description('unique id of invite'),
        data: joi.string().required().description('AES key of group encrypted for invitee'),
        timestamp: joi.number().required().description('timestamp of invite'),
      })).required(),
      admins: joi.array().items(joi.string()).required().description('brightids of admins of the group'),
      seed: joi.boolean().required().description('true if group is Seed'),
      region: joi.string().description('region of the group'),
      type: joi.string().required().description('type of the group'),
      url: joi.string().required().description('url of the group'),
      info: joi.string().description('URL of a documnet that contains info about the group'),
      timestamp: joi.number().required().description('the group creation timestamp'),
    })
  }),

  verificationPublicGetResponse: joi.object({
    data: joi.object({
      public: joi.string().required().description('the public part of WI-Schnorr params that should be used by client to generate challenge'),
    })
  }),

  verificationSigGetResponse: joi.object({
    data: joi.object({
      response: joi.string().description("WI-Schnorr server response that will be used by client to generate final signature"),
    })
  }),

  verificationAppIdPostBody: joi.object({
    sig: joi.object({
      rho: joi.string().required(),
      omega: joi.string().required(),
      sigma: joi.string().required(),
      delta: joi.string().required(),
    }).required().description('unblinded sig'),
    verification: joi.string().required().description('verification required for using the app'),
    roundedTimestamp: joi.number().integer().required().description("timestamp that is rounded to app's required precision")
  }),

  verificationGetResponse: joi.object({
    data: joi.object({
      unique: joi.string().description("true if user is unique under given context"),
      context: joi.string().description("the context name"),
      contextIds: joi.array().items(joi.string()).description("list of all contextIds this user linked from most recent to oldest including current active contextId as first member"),
      timestamp: schemas.timestamp.description("timestamp of the verification if a timestamp was requested by including a 'timestamp' parameter"),
      sig: joi.string().description("verification message signed by the node"),
      publicKey: joi.string().description("the node's public key")
    })
  }),
}, schemas);


module.exports = {
  schemas,
  operations,
};
