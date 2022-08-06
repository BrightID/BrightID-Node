const NOT_VERIFIED = 3;
const NOT_SPONSORED = 4;
const NACL_KEY_NOT_SET = 6;
const ETH_KEY_NOT_SET = 7;
const OPERATION_NOT_FOUND = 9;
const USER_NOT_FOUND = 10;
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
const HEAD_ALREADY_IS_FAMILY_MEMBER = 48;
const ALREADY_IS_FAMILY_MEMBER = 49;
const INELIGIBLE_FAMILY_MEMBER = 50;
const NOT_FAMILY = 51;
const INELIGIBLE_TO_VOUCH = 52;
const INELIGIBLE_TO_VOUCH_FOR = 53;
const INELIGIBLE_FAMILY_HEAD = 54;
const NOT_HEAD = 55;
const DUPLICATE_UID_ERROR = 56;
const DUPLICATE_SIGNERS = 57;
const WAIT_FOR_COOLDOWN = 58;
const UNACCEPTABLE_VERIFICATION = 59;
const ALREADY_IS_FAMILY = 60;
const APP_ID_NOT_FOUND = 61;
const APP_AUTHORIZED_BEFORE = 62;
const SPEND_REQUESTED_BEFORE = 63;
const INVALID_APP_ID = 64;
const CACHED_PARAMS_NOT_FOUND = 65;
const FORBIDDEN_CONNECTION = 66;
const UNSINGABLE_APP_USER_ID = 67;
const SPONSOR_REQUESTED_RECENTLY = 68;
const WRONG_NUMBER_OF_SIGNERS = 69;
const INVALID_NUMBER_OF_SIGNERS = 70;

class BrightIDError extends Error {
  constructor() {
    super();
    this.name = "BrightIDError";
    this.date = new Date();
  }
}

class BadRequestError extends BrightIDError {
  constructor() {
    super();
    this.code = 400;
    this.message = "Bad Request";
  }
}

class UnauthorizedError extends BrightIDError {
  constructor() {
    super();
    this.code = 401;
    this.message = "Unauthorized";
  }
}

class ForbiddenError extends BrightIDError {
  constructor() {
    super();
    this.code = 403;
    this.message = "Forbidden";
  }
}

class NotFoundError extends BrightIDError {
  constructor() {
    super();
    this.code = 404;
    this.message = "Not Found";
  }
}

class TooManyRequestsError extends BrightIDError {
  constructor() {
    super();
    this.code = 429;
    this.message = "Too Many Requests";
  }
}

class InternalServerError extends BrightIDError {
  constructor() {
    super();
    this.code = 500;
    this.message = "Internal Server Error";
  }
}

class InvalidSignatureError extends UnauthorizedError {
  constructor() {
    super();
    this.errorNum = INVALID_SIGNATURE;
    this.message = "Signature is not valid.";
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
    this.message = `More than ${limit} operations sent from ${senders.join(
      ", "
    )} in ${parseInt(timeWindow / 1000)} seconds. Try again after ${parseInt(
      waitingTime / 1000
    )} seconds.`;
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
    this.message = "Operation hash is not valid.";
  }
}

class NotRecoveryConnectionsError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_RECOVERY_CONNECTIONS;
    this.message = "Signers of the request are not recovery connections.";
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
  constructor(app, expression) {
    super();
    this.errorNum = NOT_VERIFIED;
    this.message = `The user is not verified for this expression (${expression}) of "${app}" app.`;
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

class NaclKeyNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = NACL_KEY_NOT_SET;
    this.message = "BN_WS_PRIVATE_KEY is not set.";
  }
}

class EthKeyNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = ETH_KEY_NOT_SET;
    this.message = "BN_WS_ETH_PRIVATE_KEY is not set.";
  }
}

class InvalidTestingKeyError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_TESTING_KEY;
    this.message = "Invalid testing key.";
  }
}

class NotAdminError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_ADMIN;
    this.message = "Requstor is not admin of the group.";
  }
}

class AlreadyHasPrimaryGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ALREADY_HAS_PRIMARY_GROUP;
    this.message = "The user already has a primary group.";
  }
}

class NewUserBeforeFoundersJoinError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NEW_USER_BEFORE_FOUNDERS_JOIN;
    this.message = "New members can not join before founders join the group.";
  }
}

class DuplicateGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DUPLICATE_GROUP;
    this.message = "Group with this id already exists.";
  }
}

class InvalidCoFoundersError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_COFOUNDERS;
    this.message =
      "One or both of the co-founders are not connected to the founder.";
  }
}

class IneligibleNewAdminError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_NEW_ADMIN;
    this.message = "New admin is not member of the group.";
  }
}

class NotInvitedError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_INVITED;
    this.message = "The user is not invited to join this group.";
  }
}

class LeaveGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = LEAVE_GROUP;
    this.message =
      "Last admin can not leave the group when it still has other members.";
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
    this.message = "The app generated id was sponsored before.";
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
    this.message =
      "Recovery level can only be selected for connections that already know you or trust you as their recovery connection.";
  }
}

class WISchnorrPasswordNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = WISCHNORR_PASSWORD_NOT_SET;
    this.message = "WISCHNORR_PASSWORD is not set in config.env.";
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
    this.message =
      "Only one signature request per verification of the app in each expiration period is allowed.";
  }
}

class HeadAlreadyIsFamilyMember extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = HEAD_ALREADY_IS_FAMILY_MEMBER;
    this.message = "The previous head can't already have another family group";
  }
}

class AlreadyIsFamilyMember extends ForbiddenError {
  constructor(user) {
    super();
    this.errorNum = ALREADY_IS_FAMILY_MEMBER;
    this.message = `${user} already is member of a family group.`;
    this.user = user;
  }
}

class IneligibleFamilyMember extends ForbiddenError {
  constructor(user) {
    super();
    this.errorNum = INELIGIBLE_FAMILY_MEMBER;
    this.message = `${user} is not eligible to join this family group.`;
    this.user = user;
  }
}

class NotFamilyError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_FAMILY;
    this.message = "The group is not a family group.";
  }
}

class IneligibleToVouch extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_TO_VOUCH;
    this.message = "This group is not eligible to vouch for.";
  }
}

class IneligibleToVouchFor extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_TO_VOUCH_FOR;
    this.message = "This user is not eligible to vouch for this group.";
  }
}

class IneligibleFamilyHead extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_FAMILY_HEAD;
    this.message = "user is not eligible to be head of the family group.";
  }
}

class NotHeadError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_HEAD;
    this.message = "Requstor is not head of the group.";
  }
}

class DuplicateUIDError extends ForbiddenError {
  constructor(uid) {
    super();
    this.errorNum = DUPLICATE_UID_ERROR;
    this.message = `uid ${uid} already exists.`;
  }
}

class DuplicateSignersError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DUPLICATE_SIGNERS;
    this.message = "Signers of the request are duplicates.";
  }
}

class WaitForCooldownError extends ForbiddenError {
  constructor(signer) {
    super();
    this.errorNum = WAIT_FOR_COOLDOWN;
    this.message = `${signer} is still in cooling down period.`;
    this.signer = signer;
  }
}

class UnacceptableVerification extends ForbiddenError {
  constructor(verification, app) {
    super();
    this.errorNum = UNACCEPTABLE_VERIFICATION;
    this.message = `"${verification}" expression is not acceptable for the "${app}".`;
    this.verification = verification;
    this.app = app;
  }
}

class AlreadyIsFamilyError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ALREADY_IS_FAMILY;
    this.message = "The group already is a family group.";
  }
}

class AppUserIdNotFoundError extends NotFoundError {
  constructor(appUserId) {
    super();
    this.errorNum = APP_ID_NOT_FOUND;
    this.message = `${appUserId} app generated id is not found.`;
    this.appUserId = appUserId;
  }
}

class AppAuthorizedBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = APP_AUTHORIZED_BEFORE;
    this.message =
      "The app authorized a sponsorship for this app-generated id before.";
  }
}

class SpendRequestedBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = SPEND_REQUESTED_BEFORE;
    this.message = "Spend request for this app-generated id submitted before.";
  }
}

class InvalidAppUserIdError extends BadRequestError {
  constructor(appUserId) {
    super();
    this.errorNum = INVALID_APP_ID;
    this.message = `The appUserId "${appUserId}" is not valid.`;
    this.appUserId = appUserId;
  }
}

class CachedParamsNotFound extends NotFoundError {
  constructor() {
    super();
    this.errorNum = CACHED_PARAMS_NOT_FOUND;
    this.message = `WISchnorr params not found.`;
  }
}

class ForbiddenConnectionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = FORBIDDEN_CONNECTION;
    this.message = "connecting to yourself is not allowed.";
  }
}

class UnsingableAppUserIdError extends BadRequestError {
  constructor(appUserId) {
    super();
    this.errorNum = UNSINGABLE_APP_USER_ID;
    this.message = "appUserIds longer than 32 bytes are not 'eth' signable";
    this.appUserId = appUserId;
  }
}

class SponsorRequestedRecently extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = SPONSOR_REQUESTED_RECENTLY;
    this.message = "The app has sent this sponsor request recently.";
  }
}

class WrongNumberOfSignersError extends ForbiddenError {
  constructor(missedAttr, requiredRecoveryNum) {
    super();
    this.errorNum = WRONG_NUMBER_OF_SIGNERS;
    this.message = `${missedAttr} is missed while ${requiredRecoveryNum} signers are required.`;
    this.missedAttr = missedAttr;
    this.requiredRecoveryNum = requiredRecoveryNum;
  }
}

class InvalidNumberOfSignersError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_NUMBER_OF_SIGNERS;
    this.message =
      "The number of signers should be equal or less than the number of recovery connections.";
  }
}

module.exports = {
  NOT_VERIFIED,
  NOT_SPONSORED,
  NACL_KEY_NOT_SET,
  ETH_KEY_NOT_SET,
  OPERATION_NOT_FOUND,
  USER_NOT_FOUND,
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
  HEAD_ALREADY_IS_FAMILY_MEMBER,
  ALREADY_IS_FAMILY_MEMBER,
  INELIGIBLE_FAMILY_MEMBER,
  NOT_FAMILY,
  INELIGIBLE_TO_VOUCH,
  INELIGIBLE_TO_VOUCH_FOR,
  INELIGIBLE_FAMILY_HEAD,
  NOT_HEAD,
  DUPLICATE_UID_ERROR,
  DUPLICATE_SIGNERS,
  WAIT_FOR_COOLDOWN,
  UNACCEPTABLE_VERIFICATION,
  ALREADY_IS_FAMILY,
  APP_ID_NOT_FOUND,
  APP_AUTHORIZED_BEFORE,
  SPEND_REQUESTED_BEFORE,
  INVALID_APP_ID,
  CACHED_PARAMS_NOT_FOUND,
  FORBIDDEN_CONNECTION,
  UNSINGABLE_APP_USER_ID,
  SPONSOR_REQUESTED_RECENTLY,
  WRONG_NUMBER_OF_SIGNERS,
  INVALID_NUMBER_OF_SIGNERS,
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
  NaclKeyNotSetError,
  EthKeyNotSetError,
  InvalidTestingKeyError,
  NotAdminError,
  AlreadyHasPrimaryGroupError,
  NewUserBeforeFoundersJoinError,
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
  DuplicateSigRequestError,
  HeadAlreadyIsFamilyMember,
  AlreadyIsFamilyMember,
  IneligibleFamilyMember,
  NotFamilyError,
  IneligibleToVouch,
  IneligibleToVouchFor,
  IneligibleFamilyHead,
  NotHeadError,
  DuplicateUIDError,
  DuplicateSignersError,
  WaitForCooldownError,
  UnacceptableVerification,
  AlreadyIsFamilyError,
  AppUserIdNotFoundError,
  AppAuthorizedBeforeError,
  SpendRequestedBeforeError,
  InvalidAppUserIdError,
  CachedParamsNotFound,
  ForbiddenConnectionError,
  UnsingableAppUserIdError,
  SponsorRequestedRecently,
  WrongNumberOfSignersError,
  InvalidNumberOfSignersError,
};
