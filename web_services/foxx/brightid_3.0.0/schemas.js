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

  membershipGetResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: joi.array().items(joi.string()).description('ids of all members of the group')
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

  signedVerificationGetResponse: joi.object({
    data: joi.object({
      publicKey: joi.string().description("the node's public key."),
      revocableAccounts: joi.array().items(joi.string()).description("accounts formerly used by this user that can be safely revoked"),
      sig: joi.string().description('verification message ( context + "," + account +  "," + timestamp [ + "," + revocableAccounts ... ] ) signed by the node'),
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


}, schemas);


module.exports = {
  schemas,
};
