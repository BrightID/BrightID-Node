const joi = require('joi');

// lowest-level schemas
var schemas = {
  score: joi.number().min(0).max(100).default(0),
  timestamp: joi.number().integer().required()
};

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  user: joi.object({
    id: joi.string().required().description('the user id'),
    score: schemas.score,
    verifications: joi.array().items(joi.string())
  }),
  group: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    score: schemas.score,
    verifications: joi.array().items(joi.string()),
    isNew: joi.boolean().default(true),
    knownMembers: joi.array().items(joi.string()).description('ids of two or three current' +
      ' members connected to the reference user, or if the group is being founded, the co-founders that have joined'),
    founders: joi.array().items(joi.string()).description('ids of the three founders of the group')
  }),
  context: joi.object({
    verification: joi.string().required().description('verification used by the context'),
    verificationUrl: joi.string().required().description('the url to PUT a verification with /:id'),
    isApp: joi.boolean().default(false),
    appLogo: joi.string().description('app logo (base64 encoded image)'),
    appUrl: joi.string().description('the base url for the web app associated with the context'),
  }),
}, schemas);

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({

  applyOperationPostBody: joi.object(),

  addOperationPostBody: joi.object({
    op: joi.string().required().description('json serialized version of the operation that should be applied after consensus')
  }),

  connectionsPutBody: joi.object({
    id1: joi.string().required().description('id of the first user'),
    id2: joi.string().required().description('id of the second user'),
    sig1: joi.string().required()
      .description('message (id1 + id2 + timestamp) signed by the user represented by id1'),
    sig2: joi.string().required()
      .description('message (id1 + id2 + timestamp) signed by the user represented by id2'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the connection occurred')
  }),

  connectionsDeleteBody: joi.object({
    id1: joi.string().required().description('id of the user removing the connection'),
    id2: joi.string().required().description('id of the second user'),
    sig1: joi.string().required()
      .description('message (id1 + id2 + timestamp) signed by the user represented by id1'),
    
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  membershipGetResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: joi.array().items(joi.string()).description('ids of all members of the group')
  }),

  membershipPutBody: joi.object({
    id: joi.string().required().description('id of the user joining the group'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (id + group + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the join was requested')
  }),

  membershipDeleteBody: joi.object({
    id: joi.string().required().description('id of the user leaving the group'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (id + group + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  groupsPostBody: joi.object({
    id1: joi.string().required().description('id of the first founder'),
    id2: joi.string().required().description('id of the second founder'),
    id3: joi.string().required().description('id of the third founder'),
    sig1: joi.string().required()
      .description('message (id1 + id2 + id3 + timestamp) signed by the user represented by id1'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the group creation was requested')
  }),

  groupsPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.group
  }),

  groupsDeleteBody: joi.object({
    id: joi.string().required().description('id of the user deleting the group'),
    group: joi.string().required().description('group id'),
    sig: joi.string().required()
      .description('message (id + group + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  fetchUserInfoPostBody: joi.object({
    id: joi.string().required().description('id of the user'),
    sig: joi.string().required()
      .description('message (id + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when the removal was requested')
  }),

  fetchUserInfoPostResponse: joi.object({
    data: joi.object({
      score: schemas.score,
      eligibleGroupsUpdated: joi.boolean()
        .description('boolean indicating whether the `eligibleGroups` array returned is up-to-date. If `true`, ' +
          '`eligibleGroups` will contain all eligible groups. If `false`, `eligibleGroups` will only contain eligible groups in the founding stage.'),
      currentGroups: joi.array().items(schemas.group),
      eligibleGroups: joi.array().items(schemas.group),
      connections: joi.array().items(schemas.user),
      verifications: joi.array().items(joi.string())
    })
  }),

  usersPostBody: joi.object({
    id: joi.string().required().description("user's id"),
    signingKey: joi.string().required().description("the public key of the user that is used to sign requests")
  }),

  usersPostResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: schemas.user
  }),

  fetchVerificationPostBody: joi.object({
    id: joi.string().required().description('id of the user'),
    context: joi.string().required().description('the context of the id (typically an application)'),
    userid: joi.string().required().description('an id used by the app consuming the verification'),
    sig: joi.string().required().description('message (context + "," + userid + "," + timestamp) signed by the user represented by id'),
    sponsorshipSig: joi.string().description('message (context + "," + id + "," + timestamp) signed by a context that wants to sponsor this user'),
    timestamp: schemas.timestamp.required().description('milliseconds since epoch when the verification was requested')
  }),

  fetchVerificationPostResponse: joi.object({
    data: joi.object({
      publicKey: joi.string().description("the node's public key."),
      revocableIds: joi.array().items(joi.string()).description("ids formerly used by this user that can be safely revoked"),
      sig: joi.string().description('verification message ( context + "," + userid +  "," + timestamp [ + "," + revocableId ... ] ) signed by the node'),
      timestamp: schemas.timestamp.description('milliseconds since epoch when the verification was signed')
    })
  }),

  ipGetResponse: joi.object({
    data: joi.object({
      ip: joi.string().description("IPv4 address in dot-decimal notation.")
    })
  }),

  userScore: joi.object({
    data: joi.object({
      score: schemas.score
    })
  }),

  userConnections: joi.object({
    data: joi.object({
      users: joi.array().items(joi.string())
    })
  }),

  contextsGetResponse: joi.object({
    data: schemas.context
  }),

  verificationGetResponse: joi.object({
    data: joi.object({
      timestamp: schemas.timestamp.description('milliseconds since epoch since the last verification')
    })
  }),

  trustedPutBody: joi.object({
    id: joi.string().required().description('id of the user'),
    trusted: joi.array().items(joi.string())
      .required().description('list of at least 3 ids that belongs to trusted connections of the user'),
    sig: joi.string().required()
      .description('message (id + trusted + timestamp) signed by the user represented by id'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when update is requested')
  }),

  signingKeyPutBody: joi.object({
    id: joi.string().required().description('id of the user'),
    signingKey: joi.string().required().description('new signing key for the user'),
    sigs: joi.array().items(
      joi.object({
        id: joi.string(),
        sig: joi.string()
      })
    ).description('list of signatures by two of trusted connections on message (id + signingKey + timestamp)'),
    timestamp: schemas.timestamp.description('milliseconds since epoch when update is requested')
  }),

}, schemas);


module.exports = {
  schemas,
};
