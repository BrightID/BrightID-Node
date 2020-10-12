const joi = require('joi');

// lowest-level schemas
var schemas = {
  score: joi.number().min(0).max(5).default(0),
  timestamp: joi.number().integer(),
};

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  user: joi.object({
    id: joi.string().required().description('the user id'),
    signingKey: joi.string().required().description('the user signingKey'),
    score: schemas.score,
    verifications: joi.array().items(joi.string()),
    hasPrimaryGroup: joi.boolean().description('true if user has primary group'),
    trusted: joi.array().items(joi.string()).description('list of trusted connections of the user'),
    flaggers: joi.object().description('an object containing ids of flaggers as key and reason as value'),
    createdAt: schemas.timestamp.required().description('the user creation timestamp'),
  }),
  groupBase: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    members: joi.array().items(joi.string()).required().description('brightids of group members'),
    type: joi.string().required().description('type of group which is "primary" or "general"'),
    founders: joi.array().items(joi.string()).required().description('brightids of group founders'),
    admins: joi.array().items(joi.string()).required().description('brightids of group admins'),
    isNew: joi.boolean().required().description('true if some of founders did not join the group yet and group is still in founding stage'),
    // score on group is deprecated and will be removed on v6
    score: schemas.score,
    url: joi.string().required().description('url of encrypted group data (name and photo)'),
    timestamp: schemas.timestamp.required().description('group creation timestamp'),
  }),
  app: joi.object({
    id: joi.string().required().description('unique app id'),
    name: joi.string().required().description('app name'),
    context: joi.string().required().description('app context'),
    verification: joi.string().required().description('verification required for using the app'),
    verificationUrl: joi.string().required().description('the url to PUT a verification with /:id'),
    logo: joi.string().description('app logo (base64 encoded image)'),
    url: joi.string().description('the base url for the app'),
    assignedSponsorships: joi.number().integer().description('number of assigned sponsorships'),
    unusedSponsorships: joi.number().integer().description('number of unused sponsorships'),
  }),
  operation: joi.alternatives().try([
    joi.object({
      name: joi.string().valid('Connect').required().description('operation name'),
      id1: joi.string().required().description('brightid of the user making the directed connection'),
      id2: joi.string().required().description('brightid of the user taking the directed connection'),
      sig1: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id1'),
      level: joi.string().valid('spam', 'human', 'known', 'recovery').required().description('level of confidence'),
      flagReason: joi.string().valid('fake', 'duplicate', 'deceased').description('for spam level, the reason for flagging the user specificed by id2 as spam'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Connect'),
    joi.object({
      name: joi.string().valid('Add Connection').required().description('operation name'),
      id1: joi.string().required().description('brightid of the first user making the connection'),
      id2: joi.string().required().description('brightid of the second user making the connection'),
      sig1: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id1'),
      sig2: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id2'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Add Connection'),
    joi.object({
      name: joi.string().valid('Remove Connection').required().description('operation name'),
      id1: joi.string().required().description('brightid of the user removing the connection'),
      id2: joi.string().required().description('brightid of the second user that the connection with is being removed'),
      reason: joi.string().valid('fake', 'duplicate', 'deceased').required().description('the reason for removing connection specificed by the user represented by id1'),
      sig1: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id1'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Remove Connection'),
    joi.object({
      name: joi.string().valid('Add Group').required().description('operation name'),
      group: joi.string().required().description('the unique id of the group'),
      id1: joi.string().required().description('brightid of the first founder'),
      id2: joi.string().required().description('brightid of the second founder'),
      id3: joi.string().required().description('brightid of the third founder'),
      inviteData2: joi.string().required().description('the group AES key encrypted for signingKey of the user represented by id2'),
      inviteData3: joi.string().required().description('the group AES key encrypted for signingKey of the user represented by id3'),
      url: joi.string().required().description('the url that group data (profile image and name) encrypted by group AES key can be fetched from'),
      type: joi.string().valid('general', 'primary').required().description('type of the group'),
      sig1: joi.string().required().description('deterministic json representation of operation object signed by the creator of group represented by id1'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Add Group'),
    joi.object({
      name: joi.string().valid('Remove Group').required().description('operation name'),
      id: joi.string().required().description('brightid of the group admin who want to remove the group'),
      group: joi.string().required().description('the unique id of the group'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id1'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Remove Group'),
    joi.object({
      name: joi.string().valid('Add Membership').required().description('operation name'),
      id: joi.string().required().description('brightid of the user wants to join the group'),
      group: joi.string().required().description('the unique id of the group that the user represented by id wants to join'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Add Membership'),
    joi.object({
      name: joi.string().valid('Remove Membership').required().description('operation name'),
      id: joi.string().required().description('brightid of the user wants to leave the group'),
      group: joi.string().required().description('the unique id of the group that the user represented by id wants to leave'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Remove Membership'),
    joi.object({
      name: joi.string().valid('Set Trusted Connections').required().description('operation name'),
      id: joi.string().required().description('brightid of the user who is setting his/her trusted connections'),
      trusted: joi.array().items(joi.string()).required().description('brightid list of trusted connections'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Set Trusted Connections'),
    joi.object({
      name: joi.string().valid('Set Signing Key').required().description('operation name'),
      id: joi.string().required().description('brightid of the user who is trying to recover his/her account by setting new signing key on his/her brightid'),
      signingKey: joi.string().required().description('the public key of the new key pair that user will use to sign operations with'),
      id1: joi.string().required().description('brightid of a trusted connection of the user represented by id'),
      id2: joi.string().required().description('brightid of another trusted connection of the user represented by id'),
      sig1: joi.string().required().description('deterministic json representation of operation object signed by the trusted connection represented by id1'),
      sig2: joi.string().required().description('deterministic json representation of operation object signed by the trusted connection represented by id2'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Set Signing Key'),
    joi.object({
      name: joi.string().valid('Link ContextId').required().description('operation name'),
      id: joi.string().description('brightid of the user who is linking his/her brightid to a context id'),
      contextId: joi.string().description('the unique id of the user represented by brightid in the specific context'),
      encrypted: joi.string().description('the json representation of `{id: id, contextId: contextId}` encrypted using an AES key shared between all nodes manage linking brightids to contextIds for a specific context. This field is not sent by clients and will be replaced by `id` and `contextId` fields before sending operation to blockchain to keep the relation of brightids to contextIds private.'),
      context: joi.string().required().description('the context name in which the user represented by brightid is linking context id with his/her brightid'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Link ContextId'),
    joi.object({
      name: joi.string().valid('Sponsor').required().description('operation name'),
      contextId: joi.string().description('the contextId for the user that is being sponsored by context'),
      id: joi.string().description('brightid of the user that is being sponsored by context. This field is not provided by context owners who sponsor the user as they do not have users brightids. BrightID nodes that are trusted by context owners and have the private key that is used to spend sponsorships assigned to the context, will replace `contextId` by this field before sending this operation to blockchain'),
      app: joi.string().required().description('the app name that user is being sponsored by'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the private key shared between context owners and trusted node operators which enable them to spend sponsorships assigned to the context'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Sponsor'),
    joi.object({
      name: joi.string().valid('Invite').required().description('operation name'),
      inviter: joi.string().required().description('brightid of the user who has admin rights in the group and can invite others to the group'),
      invitee: joi.string().required().description('brightid of the user whom is invited to the group'),
      group: joi.string().required().description('the unique id of the group that invitee is being invited to'),
      data: joi.string().required().description('the group AES key encrypted for signingKey of the invitee'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the inviter'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Invite'),
    joi.object({
      name: joi.string().valid('Dismiss').required().description('operation name'),
      dismisser: joi.string().required().description('brightid of the user who has admin rights in the group and can dismiss others from the group'),
      dismissee: joi.string().required().description('brightid of the user whom is dismissed from the group'),
      group: joi.string().required().description('the unique id of the group that dismissee is being dismissed from'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the dismisser'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Dismiss'),
    joi.object({
      name: joi.string().valid('Add Admin').required().description('operation name'),
      id: joi.string().required().description('brightid of the user who has admin rights in the group and can grant administratorship to other members'),
      admin: joi.string().required().description('brightid of the member whom is being granted administratorship of the group'),
      group: joi.string().required().description('the unique id of the group that new admin is being added to'),
      sig: joi.string().required().description('deterministic json representation of operation object signed by the user represented by id'),
      timestamp: joi.number().required().description('milliseconds since epoch when the operation created'),
      v: joi.number().required().valid(5).description('version of API')
    }).label('Add Admin')
  ]).description('Send operations to idchain to be applied to BrightID nodes\' databases after consensus')
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
      score: schemas.score,
      createdAt: schemas.timestamp.required(),
      groups: joi.array().items(schemas.group),
      invites: joi.array().items(schemas.invite),
      connections: joi.array().items(schemas.user),
      verifications: joi.array().items(joi.string()),
      isSponsored: joi.boolean(),
      trusted: joi.array().items(joi.string()),
      flaggers: joi.object().description("an object containing ids of flaggers as key and reason as value"),
    })
  }),

  operationGetResponse: joi.object({
    data: joi.object({
      state: joi.string().valid("init", "sent", "applied", "failed").description("state of operation"),
      result: joi.string().description("result of operation after being applied. If operation is failed this field contain the reason.")
    })
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

  allVerificationsGetResponse: joi.object({
    data: joi.object({
      contextIds: joi.array().items(joi.string()).description('an array of contextIds')
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
    })
  }),

}, schemas);


module.exports = {
  schemas,
};
