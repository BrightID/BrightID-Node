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
  operation: joi.object().description(`
All operations have a "name" and "timestamp" attributes.
Operations have also these operation specific attributes:

Add Connection: id1, id2, sig1, sig2
Remove Connection: id1, id2, sig1
Add Group: id1, id2, id3, sig1
Remove Group: id1, id2, sig1
Add Membership: id, group, sig
Remove Membership: id, group, sig
Set Trusted Connections: id, trusted, sig
Set Signing Key: id, signingKey, id1, id2, sig1, sig2
Link Context: id, contextId, context, sig
Sponsor: id, contextId, context, sig`)
}, schemas);

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({

  membershipGetResponse: joi.object({
    // wrap the data in a "data" object https://jsonapi.org/format/#document-top-level
    data: joi.array().items(joi.string()).description('ids of all members of the group')
  }),

  userGetResponse: joi.object({
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

  operationGetResponse: joi.object({
    data: joi.object({
      state: joi.string(),
      result: joi.string()
    })
  }),

  verificationGetResponse: joi.object({
    data: joi.object({
      publicKey: joi.string().description("the node's public key."),
      hashedId: joi.array().items(joi.string()).description('sha256 hash of ( brightid + context_secret_key)'),
      sig: joi.string().description('verification message ( context + "," + contextId +  "," + timestamp + "," + revocableContextIds ) signed by the node'),
      timestamp: schemas.timestamp.description('milliseconds since epoch when the verification was signed')
    })
  }),

  ipGetResponse: joi.object({
    data: joi.object({
      ip: joi.string().description("IPv4 address in dot-decimal notation.")
    })
  }),

  contextsGetResponse: joi.object({
    data: schemas.context
  }),

}, schemas);


module.exports = {
  schemas,
};
