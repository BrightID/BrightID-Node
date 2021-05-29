const NOT_VERIFIED = 3;
const NOT_SPONSORED = 4;
const ETHPRIVATEKEY_NOT_SET = 7;
const OPERATION_NOT_FOUND = 9;
const USER_NOT_FOUND = 10;
const IP_NOT_SET = 11;
const APP_NOT_FOUND = 12;
const INVALID_EXPRESSION = 13;
const INVALID_TESTING_KEY = 14;
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
const ALREADY_HAS_PRIMARY_GROUP = 28;
const NEW_USER_BEFORE_FOUNDERS_JOIN = 29;
const INVALID_GROUP_TYPE = 30;
const DUPLICATE_GROUP = 31;
const INVALID_COFOUNDERS = 32;
const INELIGIBLE_NEW_ADMIN = 33;
const NOT_INVITED = 34;
const LEAVE_GROUP = 35;
const TOO_MANY_LINK_REQUEST = 37;
const UNUSED_SPONSORSHIPS = 38;
const SPONSORED_BEFORE = 39;
const SPONSOR_NOT_SUPPORTED = 40;
const NOT_ADMIN = 41;
const ARANGO_ERROR = 42;
const INELIGIBLE_RECOVERY_CONNECTION = 43;
const WISCHNORR_PASSWORD_NOT_SET = 45;
const INVALID_ROUNDED_TIMESTAMP = 46;
const DUPLICATE_SIG_REQUEST_ERROR = 47;

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

class GroupNotFoundError extends NotFoundError {
  constructor(group) {
    super();
    this.errorNum = GROUP_NOT_FOUND;
    this.message = `The group ${group} is not found.`;
    this.group = group;
  }
}

class NotSponsoredError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_SPONSORED;
    this.message = `The user is not sponsored.`;
  }
}

class NotVerifiedError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = NOT_VERIFIED;
    this.message = `The user is not verified for ${app} app.`;
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
    this.message = 'The user is sponsored before.';
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

class IneligibleRecoveryConnectionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_RECOVERY_CONNECTION;
    this.message = 'Recovery level can only be selected for connections that already know you or trust you as their recovery connection.';
  }
}

class WISchnorrPasswordNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = WISCHNORR_PASSWORD_NOT_SET;
    this.message = 'WISCHNORR_PASSWORD is not set in config.env.';
  }
}

class InvalidRoundedTimestampError extends ForbiddenError {
  constructor(serverRoundedTimestamp, roundedTimestamp) {
    super();
    this.errorNum = INVALID_ROUNDED_TIMESTAMP;
    this.message = `Server calculated rounded timestamp is ${serverRoundedTimestamp}, but client sent ${roundedTimestamp}.`;
  }
}

class DuplicateSigRequestError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DUPLICATE_SIG_REQUEST_ERROR;
    this.message = 'Only one signature request per app in each expiration period is allowed.';
  }
}

module.exports = {
  NOT_VERIFIED,
  NOT_SPONSORED,
  ETHPRIVATEKEY_NOT_SET,
  OPERATION_NOT_FOUND,
  USER_NOT_FOUND,
  IP_NOT_SET,
  APP_NOT_FOUND,
  INVALID_EXPRESSION,
  INVALID_TESTING_KEY,
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
  UNUSED_SPONSORSHIPS,
  SPONSORED_BEFORE,
  SPONSOR_NOT_SUPPORTED,
  NOT_ADMIN,
  ARANGO_ERROR,
  INELIGIBLE_RECOVERY_CONNECTION,
  WISCHNORR_PASSWORD_NOT_SET,
  INVALID_ROUNDED_TIMESTAMP,
  DUPLICATE_SIG_REQUEST_ERROR,
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
  GroupNotFoundError,
  NotSponsoredError,
  NotVerifiedError,
  InvalidExpressionError,
  EthPrivatekeyNotSetError,
  IpNotSetError,
  InvalidTestingKeyError,
  NotAdminError,
  AlreadyHasPrimaryGroupError,
  NewUserBeforeFoundersJoinError,
  InvalidGroupTypeError,
  DuplicateGroupError,
  InvalidCoFoundersError,
  IneligibleNewAdminError,
  NotInvitedError,
  LeaveGroupError,
  UnusedSponsorshipsError,
  SponsoredBeforeError,
  SponsorNotSupportedError,
  IneligibleRecoveryConnectionError,
  InvalidRoundedTimestampError,
  WISchnorrPasswordNotSetError,
  DuplicateSigRequestError
}