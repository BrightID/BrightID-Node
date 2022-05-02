const CONTEXT_NOT_FOUND = 1;
const CONTEXTID_NOT_FOUND = 2;
const NOT_VERIFIED = 3;
const NOT_SPONSORED = 4;
const KEYPAIR_NOT_SET = 6;
const ETHPRIVATEKEY_NOT_SET = 7;
const OPERATION_NOT_FOUND = 9;
const USER_NOT_FOUND = 10;
const IP_NOT_SET = 11;
const APP_NOT_FOUND = 12;
const INVALID_EXPRESSION = 13;
const INVALID_TESTING_KEY = 14;
const INVALID_PASSCODE = 15;
const PASSCODE_NOT_SET = 16;
const GROUP_NOT_FOUND = 17;
const INVALID_OPERATION_NAME = 18;
const INVALID_SIGNATURE = 19;
const TOO_MANY_OPERATIONS = 20;
const INVALID_OPERATION_VERSION = 21;
const INVALID_TIMESTAMP = 22;
const NOT_RECOVERY_CONNECTIONS = 23;
const INVALID_HASH = 24;
const OPERATION_APPLIED_BEFORE = 25;
const TOO_BIG_OPERATION = 26;
const INELIGIBLE_NEW_USER = 27;
const ALREADY_HAS_PRIMARY_GROUP = 28;
const NEW_USER_BEFORE_FOUNDERS_JOIN = 29;
const INVALID_GROUP_TYPE = 30;
const DUPLICATE_GROUP = 31;
const INVALID_COFOUNDERS = 32;
const INELIGIBLE_NEW_ADMIN = 33;
const NOT_INVITED = 34;
const LEAVE_GROUP = 35;
const DUPLICATE_CONTEXTID = 36;
const TOO_MANY_LINK_REQUEST = 37;
const UNUSED_SPONSORSHIPS = 38;
const SPONSORED_BEFORE = 39;
const SPONSOR_NOT_SUPPORTED = 40;
const NOT_ADMIN = 41;
const ARANGO_ERROR = 42;
const INELIGIBLE_RECOVERY_CONNECTION = 43;
const INVALID_CONTEXTID = 44;
const APP_AUTHORIZED_BEFORE = 45;
const SPEND_REQUESTED_BEFORE = 46;

class BrightIDError extends Error {
  constructor() {
    super();
    this.name = 'BrightIDError';
    this.date = new Date();
  }
}

class BadRequestError extends BrightIDError {
  constructor() {
    super();
    this.code = 400;
    this.message = 'Bad Request';
  }
}

class UnauthorizedError extends BrightIDError {
  constructor() {
    super();
    this.code = 401;
    this.message = 'Unauthorized';
  }
}

class ForbiddenError extends BrightIDError {
  constructor() {
    super();
    this.code = 403;
    this.message = 'Forbidden';
  }
}

class NotFoundError extends BrightIDError {
  constructor() {
    super();
    this.code = 404;
    this.message = 'Not Found';
  }
}

class TooManyRequestsError extends BrightIDError {
  constructor() {
    super();
    this.code = 429;
    this.message = 'Too Many Requests';
  }
}

class InternalServerError extends BrightIDError {
  constructor() {
    super();
    this.code = 500;
    this.message = 'Internal Server Error';
  }
}

class InvalidSignatureError extends UnauthorizedError {
  constructor() {
    super();
    this.errorNum = INVALID_SIGNATURE;
    this.message = 'Signature is not valid.';
  }
}

class AppNotFoundError extends NotFoundError {
  constructor(app) {
    super();
    this.errorNum = APP_NOT_FOUND;
    this.message = `${app} app is not found.`;
    this.app = app;
  }
}

class TooManyOperationsError extends TooManyRequestsError {
  constructor(senders, waitingTime, timeWindow, limit) {
    super();
    this.errorNum = TOO_MANY_OPERATIONS;
    this.message = `More than ${limit} operations sent from ${senders.join(', ')} in ${parseInt(timeWindow / 1000)} seconds. Try again after ${parseInt(waitingTime / 1000)} seconds.`;
    this.senders = senders;
    this.waitingTime = waitingTime;
    this.timeWindow = timeWindow;
    this.limit = limit;
  }
}

class InvalidOperationNameError extends BadRequestError {
  constructor(name) {
    super();
    this.errorNum = INVALID_OPERATION_NAME;
    this.message = `${name} is not a valid operation name.`;
    this.name = name;
  }
}

class InvalidOperationVersionError extends BadRequestError {
  constructor(v) {
    super();
    this.errorNum = INVALID_OPERATION_VERSION;
    this.message = `${v} is not a valid operation version.`;
    this.v = v;
  }
}

class InvalidOperationTimestampError extends ForbiddenError {
  constructor(timestamp) {
    super();
    this.errorNum = INVALID_TIMESTAMP;
    this.message = `The timestamp (${timestamp}) is in the future.`;
    this.timestamp = timestamp;
  }
}

class InvalidOperationHashError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_HASH;
    this.message = 'Operation hash is not valid.';
  }
}

class NotRecoveryConnectionsError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_RECOVERY_CONNECTIONS;
    this.message = 'Signers of the request are not recovery connections.';
  }
}

class OperationNotFoundError extends NotFoundError {
  constructor(hash) {
    super();
    this.errorNum = OPERATION_NOT_FOUND;
    this.message = `The operation ${hash} is not found.`;
    this.hash = hash;
  }
}

class OperationAppliedBeforeError extends ForbiddenError {
  constructor(hash) {
    super();
    this.errorNum = OPERATION_APPLIED_BEFORE;
    this.message = `The Operation ${hash} was applied before.`;
    this.hash = hash;
  }
}

class TooBigOperationError extends ForbiddenError {
  constructor(limit) {
    super();
    this.errorNum = TOO_BIG_OPERATION;
    this.message = `The Operation is bigger than ${limit} bytes limit.`;
    this.limit = limit;
  }
}

class UserNotFoundError extends NotFoundError {
  constructor(user) {
    super();
    this.errorNum = USER_NOT_FOUND;
    this.message = `The user ${user} is not found.`;
    this.user = user;
  }
}

class ContextNotFoundError extends NotFoundError {
  constructor(context) {
    super();
    this.errorNum = CONTEXT_NOT_FOUND;
    this.message = `The context ${context} is not found.`;
    this.context = context;
  }
}

class ContextIdNotFoundError extends NotFoundError {
  constructor(contextId) {
    super();
    this.errorNum = CONTEXTID_NOT_FOUND;
    this.message = `The contextId ${contextId} is not linked.`;
    this.contextId = contextId;
  }
}

class GroupNotFoundError extends NotFoundError {
  constructor(group) {
    super();
    this.errorNum = GROUP_NOT_FOUND;
    this.message = `The group ${group} is not found.`;
    this.group = group;
  }
}

class NotSponsoredError extends ForbiddenError {
  constructor(contextId) {
    super();
    this.errorNum = NOT_SPONSORED;
    this.message = `The user linked to the contextId ${contextId} is not sponsored.`;
    this.contextId = contextId;
  }
}

class NotVerifiedError extends ForbiddenError {
  constructor(contextId, app) {
    super();
    this.errorNum = NOT_VERIFIED;
    this.message = `The user linked to contextId ${contextId} is not verified for ${app} app.`;
    this.contextId = contextId;
    this.app = app;
  }
}

class InvalidExpressionError extends InternalServerError {
  constructor(app, expression, err) {
    super();
    this.errorNum = INVALID_EXPRESSION;
    this.message = `Evaluating verification expression for ${app} app failed. Expression: "${expression}", Error: ${err}`;
  }
}

class KeypairNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = KEYPAIR_NOT_SET;
    this.message = 'BN_WS_PUBLIC_KEY or BN_WS_PRIVATE_KEY are not set in config.env.';
  }
}

class EthPrivatekeyNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = ETHPRIVATEKEY_NOT_SET;
    this.message = 'BN_WS_ETH_PRIVATE_KEY is not set.';
  }
}

class IpNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = IP_NOT_SET;
    this.message = 'BN_WS_IP variable is not set in config.env and is not automatically loaded for an unknown reason.';
  }
}

class InvalidTestingKeyError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_TESTING_KEY;
    this.message = 'Invalid testing key.';
  }
}

class PasscodeNotSetError extends ForbiddenError {
  constructor(context) {
    super();
    this.errorNum = PASSCODE_NOT_SET;
    this.message = `Passcode is not set on the remote node for the ${context} context.`;
    this.context = context;
  }
}

class InvalidPasscodeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_PASSCODE;
    this.message = 'Invalid passcode.';
  }
}

class NotAdminError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_ADMIN;
    this.message = 'Requstor is not admin of the group.';
  }
}

class AlreadyHasPrimaryGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ALREADY_HAS_PRIMARY_GROUP;
    this.message = 'The user already has a primary group.';
  }
}

class NewUserBeforeFoundersJoinError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NEW_USER_BEFORE_FOUNDERS_JOIN;
    this.message = 'New members can not join before founders join the group.';
  }
}

class InvalidGroupTypeError extends ForbiddenError {
  constructor(type) {
    super();
    this.errorNum = INVALID_GROUP_TYPE;
    this.message = `${type} is not a valid group type.`;
    this.type = type;
  }
}

class DuplicateGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DUPLICATE_GROUP;
    this.message = 'Group with this id already exists.';
  }
}

class InvalidCoFoundersError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_COFOUNDERS;
    this.message = 'One or both of the co-founders are not connected to the founder.';
  }
}

class IneligibleNewAdminError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_NEW_ADMIN;
    this.message = 'New admin is not member of the group.';
  }
}

class NotInvitedError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_INVITED;
    this.message = 'The user is not invited to join this group.';
  }
}

class LeaveGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = LEAVE_GROUP;
    this.message = 'Last admin can not leave the group when it still has other members.';
  }
}

class DuplicateContextIdError extends ForbiddenError {
  constructor(contextId) {
    super();
    this.errorNum = DUPLICATE_CONTEXTID;
    this.message = `The contextId ${contextId} is used by another user before.`;
    this.contextId = contextId;
  }
}

class TooManyLinkRequestError extends TooManyRequestsError {
  constructor() {
    super();
    this.errorNum = TOO_MANY_LINK_REQUEST;
    this.message = 'Only three contextIds can be linked every 24 hours.';
  }
}

class UnusedSponsorshipsError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = UNUSED_SPONSORSHIPS;
    this.message = `${app} app does not have unused sponsorships.`;
    this.app = app;
  }
}

class SponsoredBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = SPONSORED_BEFORE;
    this.message = 'The contextId is sponsored before.';
  }
}

class SponsorNotSupportedError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = SPONSOR_NOT_SUPPORTED;
    this.message = `This node can not relay sponsor requests for ${app} app.`;
    this.app = app;
  }
}

class IneligibleRecoveryConnection extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_RECOVERY_CONNECTION;
    this.message = 'Recovery level can only be selected for connections that already know you or trust you as their recovery connection.';
  }
}

class InvalidContextIdError extends NotFoundError {
  constructor(contextId) {
    super();
    this.errorNum = INVALID_CONTEXTID;
    this.message = `The contextId ${contextId} is not valid.`;
    this.contextId = contextId;
  }
}

class AppAuthorizedBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = APP_AUTHORIZED_BEFORE;
    this.message =
      "The app authorized a sponsorship for this contextId before.";
  }
}

class SpendRequestedBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = SPEND_REQUESTED_BEFORE;
    this.message = "Spend request for this contextId submitted before.";
  }
}

module.exports = {
  CONTEXT_NOT_FOUND,
  CONTEXTID_NOT_FOUND,
  NOT_VERIFIED,
  NOT_SPONSORED,
  KEYPAIR_NOT_SET,
  ETHPRIVATEKEY_NOT_SET,
  OPERATION_NOT_FOUND,
  USER_NOT_FOUND,
  IP_NOT_SET,
  APP_NOT_FOUND,
  INVALID_EXPRESSION,
  INVALID_TESTING_KEY,
  INVALID_PASSCODE,
  PASSCODE_NOT_SET,
  GROUP_NOT_FOUND,
  INVALID_OPERATION_NAME,
  INVALID_SIGNATURE,
  TOO_MANY_OPERATIONS,
  INVALID_OPERATION_VERSION,
  INVALID_TIMESTAMP,
  NOT_RECOVERY_CONNECTIONS,
  INVALID_HASH,
  OPERATION_APPLIED_BEFORE,
  TOO_BIG_OPERATION,
  ALREADY_HAS_PRIMARY_GROUP,
  NEW_USER_BEFORE_FOUNDERS_JOIN,
  INVALID_GROUP_TYPE,
  DUPLICATE_GROUP,
  INVALID_COFOUNDERS,
  INELIGIBLE_NEW_ADMIN,
  NOT_INVITED,
  LEAVE_GROUP,
  DUPLICATE_CONTEXTID,
  TOO_MANY_LINK_REQUEST,
  UNUSED_SPONSORSHIPS,
  SPONSORED_BEFORE,
  SPONSOR_NOT_SUPPORTED,
  NOT_ADMIN,
  ARANGO_ERROR,
  INELIGIBLE_RECOVERY_CONNECTION,
  INVALID_CONTEXTID,
  APP_AUTHORIZED_BEFORE,
  SPEND_REQUESTED_BEFORE,
  BrightIDError,
  BadRequestError,
  InternalServerError,
  TooManyRequestsError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  InvalidSignatureError,
  AppNotFoundError,
  TooManyOperationsError,
  InvalidOperationNameError,
  InvalidOperationVersionError,
  InvalidOperationTimestampError,
  InvalidOperationHashError,
  NotRecoveryConnectionsError,
  OperationNotFoundError,
  OperationAppliedBeforeError,
  TooBigOperationError,
  UserNotFoundError,
  ContextNotFoundError,
  ContextIdNotFoundError,
  GroupNotFoundError,
  NotSponsoredError,
  NotVerifiedError,
  InvalidExpressionError,
  KeypairNotSetError,
  EthPrivatekeyNotSetError,
  IpNotSetError,
  InvalidTestingKeyError,
  PasscodeNotSetError,
  InvalidPasscodeError,
  NotAdminError,
  AlreadyHasPrimaryGroupError,
  NewUserBeforeFoundersJoinError,
  InvalidGroupTypeError,
  DuplicateGroupError,
  InvalidCoFoundersError,
  IneligibleNewAdminError,
  NotInvitedError,
  LeaveGroupError,
  DuplicateContextIdError,
  TooManyLinkRequestError,
  UnusedSponsorshipsError,
  SponsoredBeforeError,
  SponsorNotSupportedError,
  IneligibleRecoveryConnection,
  InvalidContextIdError,
  AppAuthorizedBeforeError,
  SpendRequestedBeforeError,
}