const joi = require('joi');

// lowest-level schemas
var schemas = {
  score: joi.number().min(0).max(100).default(0),
  timestamp: joi.number().integer(),
};

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({
  user: joi.object({
    id: joi.string().required().description('the user id'),
    score: schemas.score,
    verifications: joi.array().items(joi.string()),
    flaggers: joi.object().description("an object containing ids of flaggers as key and reason as value"),
  }),
  group: joi.object({
    id: joi.string().required().description('unique identifier of the group'),
    score: schemas.score,
    verifications: joi.array().items(joi.string()),
    isNew: joi.boolean().default(true),
    knownMembers: joi.array().items(joi.string()).description('ids of two or three current' +
      ' members connected to the reference user, or if the group is being founded, the co-founders that have joined'),
    founders: joi.array().items(joi.string()).description('ids of the three founders of the group'),
    joined: schemas.timestamp.description('timestamp when the user joined'),
    invited: schemas.timestamp.description('timestamp when the user was invited'),
  }),
  context: joi.object({
    verification: joi.string().required().description('verification used by the context'),
    verificationUrl: joi.string().required().description('the url to PUT a verification with /:id'),
    isApp: joi.boolean().default(false),
    appLogo: joi.string().description('app logo (base64 encoded image)'),
    appUrl: joi.string().description('the base url for the web app associated with the context'),
    unusedSponsorships: joi.number().integer().description('number of unused sponsorships'),
  }),
  briefContext: joi.object({
    name: joi.string().required().description('name of the context'),
    assignedSponsorships: joi.number().integer().description('number of assigned sponsorships'),
    unusedSponsorships: joi.number().integer().description('number of unused sponsorships'),
  }),
  operation: joi.object().description(`
All operations have "name", "timestamp" and "v" attributes.
Operations have also these operation specific attributes:

Add Connection: id1, id2, sig1, sig2
Remove Connection: id1, id2, reason, sig1
Add Group: group, id1, id2, inviteData2, id3, inviteData3, url, type, sig1
Remove Group: id, group, sig
Add Membership: id, group, sig
Remove Membership: id, group, sig
Set Trusted Connections: id, trusted, sig
Set Signing Key: id, signingKey, id1, id2, sig1, sig2
Link Context: id, contextId, context, sig
Sponsor: contextId, context, sig
Invite: inviter, invitee, group, data, sig
Dismiss: dismisser, dismissee, group, sig
Add Admin: id, admin, group, sig
`)
}, schemas);

// extend lower-level schemas with higher-level schemas
schemas = Object.assign({

  userGetResponse: joi.object({
    data: joi.object({
      score: schemas.score,
      createdAt: schemas.timestamp.required(),
      groups: joi.array().items(schemas.group),
      invites: joi.array().items(schemas.group),
      connections: joi.array().items(schemas.user),
      verifications: joi.array().items(joi.string()),
      isSponsored: joi.boolean(),
      flaggers: joi.object().description("an object containing ids of flaggers as key and reason as value"),
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
      unique: joi.string().description("true if user is unique under given context"),
      context: joi.string().description("the context name"),
      contextIds: joi.array().items(joi.string()).description('an array of contextIds'),
      sig: joi.string().description('verification message ( context + "," + contextIds ) signed by the node'),
      publicKey: joi.string().description("the node's public key")
    })
  }),

  contextVerificationGetResponse: joi.object({
    data: joi.object({
      contextIds: joi.array().items(joi.string()).description('an array of contextIds')
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

  allContextsGetResponse: joi.object({
    data: joi.object({
      contexts: joi.array().items(schemas.briefContext)
    })
  }),

}, schemas);


module.exports = {
  schemas,
};
