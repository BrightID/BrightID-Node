const CONTEXT_NOT_FOUND = 1;
const CONTEXTID_NOT_FOUND = 2;
const CAN_NOT_BE_VERIFIED = 3;
const NOT_SPONSORED = 4;
const OLD_ACCOUNT = 5;
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
const INVALID_RECOVERY_CONNECTIONS = 23;
const INVALID_HASH = 24;
const OPERATION_APPLIED_BEFORE = 25;
const TOO_BIG_OPERATION = 26;
const INVALID_GROUP_ID = 27;
const INVALID_INVITER = 28;
const INELIGIBLE_NEW_USER = 29;
const ALREADY_HAS_PRIMARY_GROUP = 30;
const NEW_USER_BEFORE_FOUNDERS_JOIN = 31;
const INVALID_DISMISSER = 32;
const INVALID_GROUP_TYPE = 33;
const DUPLICATE_GROUP = 34;
const INVALID_COFOUNDERS = 35;
const FOUNDERS_PRIMARY_GROUP = 36;
const INELIGIBLE_NEW_ADMIN = 37;
const ADD_ADMIN_PERMISSION = 38;
const NOT_INVITED = 39;
const DELETE_GROUP_PERMISSION = 40;
const LEAVE_GROUP = 41;
const DUPLICATE_CONTEXTID = 42;
const TOO_MANY_LINK_REQUEST = 43;
const UNUSED_SPONSORSHIPS = 44;
const SPONSORED_BEFORE = 45;
const FORBIDDEN_SPONSOR_REQUEST = 46;
const UPDATE_GROUP_PERMISSION = 47;
const REPLACED_BRIGHTID = 48;

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
    this.message = 'not found';
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

class InvalidSignatureError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_SIGNATURE;
    this.message = 'Invalid signature';
  }
}

class AppNotFoundError extends NotFoundError {
  constructor(app) {
    super();
    this.errorNum = APP_NOT_FOUND;
    this.message = `The app: ${app} is not found`;
    this.app = app;
  }
}

class TooManyOperationsError extends TooManyRequestsError {
  constructor() {
    super();
    this.errorNum = TOO_MANY_OPERATIONS;
    this.message = 'Too many operations';
  }
}

class InvalidOperationNameError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_OPERATION_NAME;
    this.message = 'Invalid operation name';
  }
}

class InvalidOperationVersionError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_OPERATION_VERSION;
    this.message = 'Invalid operation version';
  }
}

class InvalidOperationTimestampError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_TIMESTAMP;
    this.message = "Timestamp can't be in the future";
  }
}

class InvalidOperationHashError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_HASH;
    this.message = 'Invalid operation hash';
  }
}

class InvalidRecoveryConnectionsError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_RECOVERY_CONNECTIONS;
    this.message = 'Request should be signed by 2 different recovery connections';
  }
}

class OperationNotFoundError extends NotFoundError {
  constructor(operationHash) {
    super();
    this.errorNum = OPERATION_NOT_FOUND;
    this.message = `The operation represented by operationHash: ${operationHash} is not found`;
    this.operationHash = operationHash;
  }
}

class OperationAppliedBeforeError extends BadRequestError {
  constructor(operationHash) {
    super();
    this.errorNum = OPERATION_APPLIED_BEFORE;
    this.message = `The operation represented by operationHash: ${operationHash} was applied before`;
    this.operationHash = operationHash;
  }
}

class TooBigOperationError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = TOO_BIG_OPERATION;
    this.message = 'Operation is too big';
  }
}

class UserNotFoundError extends NotFoundError {
  constructor(user) {
    super();
    this.errorNum = USER_NOT_FOUND;
    this.message = `The user: ${user} is not found`;
    this.user = user;
  }
}

class ContextNotFoundError extends NotFoundError {
  constructor(context) {
    super();
    this.errorNum = CONTEXT_NOT_FOUND;
    this.message = `The context: ${context} is not found`;
    this.context = context;
  }
}

class ContextIdNotFoundError extends NotFoundError {
  constructor(contextId) {
    super();
    this.errorNum = CONTEXTID_NOT_FOUND;
    this.message = `The contextId: ${contextId} is not linked`;
    this.contextId = contextId;
  }
}

class GroupNotFoundError extends NotFoundError {
  constructor(group) {
    super();
    this.errorNum = GROUP_NOT_FOUND;
    this.message = `The group: ${group} is not found`;
    this.group = group;
  }
}

class NotSponsoredError extends ForbiddenError {
  constructor(contextId) {
    super();
    this.errorNum = NOT_SPONSORED;
    this.message = `The user represented by contextId: ${contextId} is not sponsored`;
    this.contextId = contextId;
  }
}

class CanNotBeVerifiedError extends NotFoundError {
  constructor(contextId, app) {
    super();
    this.errorNum = CAN_NOT_BE_VERIFIED;
    this.message = `The user represented by contextId: ${contextId} is not verified for app: ${app}`;
    this.contextId = contextId;
    this.app = app;
  }
}

class InvalidExpressionError extends NotFoundError {
  constructor() {
    super();
    this.errorNum = INVALID_EXPRESSION;
    this.message = 'Invalid verification expression';
  }
}

class KeypairNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = KEYPAIR_NOT_SET;
    this.message = 'Server setting key pair not set';
  }
}

class EthPrivatekeyNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = ETHPRIVATEKEY_NOT_SET;
    this.message = 'Server setting "ethPrivateKey" not set';
  }
}

class IpNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = IP_NOT_SET;
    this.message = 'Server setting "IP" not set';
  }
}

class InvalidTestingKeyError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_TESTING_KEY;
    this.message = 'Invalid testing key';
  }
}

class PasscodeNotSetError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = PASSCODE_NOT_SET;
    this.message = 'Passcode not set';
  }
}

class InvalidPasscodeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_PASSCODE;
    this.message = 'Invalid passcode';
  }
}

class InvalidGroupIdError extends BadRequestError {
  constructor(groupId) {
    super();
    this.errorNum = INVALID_GROUP_ID;
    this.message = `Invalid group id: ${groupId}`;
    this.groupId = groupId;
  }
}

class InvalidInviterError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_INVITER;
    this.message = 'Inviter is not admin of group';
  }
}

class IneligibleNewUserError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_NEW_USER;
    this.message = 'The new user is not eligible to join this group';
  }
}

class AlreadyHasPrimaryGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ALREADY_HAS_PRIMARY_GROUP;
    this.message = 'User already has a primary group';
  }
}

class NewUserBeforeFoundersJoinError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NEW_USER_BEFORE_FOUNDERS_JOIN;
    this.message = 'New members can not be joined before founders join the group';
  }
}

class InvalidDismisserError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_DISMISSER;
    this.message = 'Dismisser is not admin of group';
  }
}

class InvalidGroupTypeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_GROUP_TYPE;
    this.message = 'Invalid group type';
  }
}

class DuplicateGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DUPLICATE_GROUP;
    this.message = 'Duplicate group';
  }
}

class InvalidCoFoundersError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_COFOUNDERS;
    this.message = 'One or both of the co-founders are not connected to the founder';
  }
}

class FoundersPrimaryGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = FOUNDERS_PRIMARY_GROUP;
    this.message = 'Some of founders already have primary groups';
  }
}

class IneligibleNewAdminError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_NEW_ADMIN;
    this.message = 'New admin is not member of the group';
  }
}

class AddAdminPermissionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ADD_ADMIN_PERMISSION;
    this.message = 'Only admins can add new admins';
  }
}

class NotInvitedError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_INVITED;
    this.message = 'The user not invited to join this group';
  }
}

class DeleteGroupPermissionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DELETE_GROUP_PERMISSION;
    this.message = 'Only admins can delete a group';
  }
}

class LeaveGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = LEAVE_GROUP;
    this.message = 'Last admin can not leave the group';
  }
}

class DuplicateContextIdError extends ForbiddenError {
  constructor(contextId) {
    super();
    this.errorNum = DUPLICATE_CONTEXTID;
    this.message = `ContextId: ${contextId} is duplicate`;
    this.contextId = contextId;
  }
}

class TooManyLinkRequestError extends TooManyRequestsError {
  constructor() {
    super();
    this.errorNum = TOO_MANY_LINK_REQUEST;
    this.message = 'Only three contextIds can be linked every 24 hours';
  }
}

class UnusedSponsorshipsError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = UNUSED_SPONSORSHIPS;
    this.message = `The app: ${app} does not have unused sponsorships`;
    this.app = app;
  }
}

class SponsoredBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = SPONSORED_BEFORE;
    this.message = 'The user is sponsored before';
  }
}

class ForbiddenSponsorError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = FORBIDDEN_SPONSOR_REQUEST;
    this.message = `Can not relay sponsor requests for this app: ${app}`;
    this.contextId = contextId;
  }
}

class UpdateGroupPermissionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = UPDATE_GROUP_PERMISSION;
    this.message = 'Only admins can update the group';
  }
}

class ReplacedBrightidError extends NotFoundError {
  constructor() {
    super();
    this.errorNum = REPLACED_BRIGHTID;
    this.message = 'The new brightid replaced with the reported brightid not found';
  }
}

module.exports = {
  InvalidSignatureError,
  AppNotFoundError,
  TooManyOperationsError,
  InvalidOperationNameError,
  InvalidOperationVersionError,
  InvalidOperationTimestampError,
  InvalidOperationHashError,
  InvalidRecoveryConnectionsError,
  OperationNotFoundError,
  OperationAppliedBeforeError,
  TooBigOperationError,
  UserNotFoundError,
  ContextNotFoundError,
  ContextIdNotFoundError,
  GroupNotFoundError,
  NotSponsoredError,
  CanNotBeVerifiedError,
  InvalidExpressionError,
  KeypairNotSetError,
  EthPrivatekeyNotSetError,
  IpNotSetError,
  InvalidTestingKeyError,
  PasscodeNotSetError,
  InvalidPasscodeError,
  InvalidGroupIdError,
  InvalidInviterError,
  IneligibleNewUserError,
  AlreadyHasPrimaryGroupError,
  NewUserBeforeFoundersJoinError,
  InvalidDismisserError,
  InvalidGroupTypeError,
  DuplicateGroupError,
  InvalidCoFoundersError,
  FoundersPrimaryGroupError,
  IneligibleNewAdminError,
  AddAdminPermissionError,
  NotInvitedError,
  DeleteGroupPermissionError,
  LeaveGroupError,
  DuplicateContextIdError,
  TooManyLinkRequestError,
  UnusedSponsorshipsError,
  SponsoredBeforeError,
  ForbiddenSponsorError,
  UpdateGroupPermissionError,
  ReplacedBrightidError,
}