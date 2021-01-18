const util = require('util');

const CONTEXT_NOT_FOUND = { 'number': 1, 'message': 'The context: %s is not found' };
const CONTEXTID_NOT_FOUND = { 'number': 2, 'message': 'The contextId: %s is not linked' };
const CAN_NOT_BE_VERIFIED = { 'number': 3, 'message': 'The user represented by contextId: %s is not verified for app: %s' };
const NOT_SPONSORED = { 'number': 4, 'message': 'The user represented by contextId: %s is not sponsored' };
const OLD_ACCOUNT = { 'number': 5, 'message': 'Old account' };
const KEYPAIR_NOT_SET = { 'number': 6, 'message': 'Server setting key pair not set' };
const ETHPRIVATEKEY_NOT_SET = { 'number': 7, 'message': 'Server setting "ethPrivateKey" not set' };
const OPERATION_NOT_FOUND = { 'number': 9, 'message': 'The operation represented by operationHash: %s is not found' };
const USER_NOT_FOUND = { 'number': 10, 'message': 'The user: %s is not found' };
const IP_NOT_SET = { 'number': 11, 'message': 'Server setting "IP" not set' };
const APP_NOT_FOUND = { 'number': 12, 'message': 'The app: %s is not found' };
const INVALID_EXPRESSION = { 'number': 13, 'message': 'Invalid verification expression' };
const INVALID_TESTING_KEY = { 'number': 14, 'message': 'Invalid testing key' };
const INVALID_PASSCODE = { 'number': 15, 'message': 'Invalid passcode' };
const PASSCODE_NOT_SET = { 'number': 16, 'message': 'Passcode not set' };
const GROUP_NOT_FOUND = { 'number': 17, 'message': 'The group: %s is not found' };
const INVALID_OPERATION_NAME = { 'number': 18, 'message': 'Invalid operation name' };
const INVALID_SIGNATURE = { 'number': 19, 'message': 'Invalid signature' };
const TOO_MANY_OPERATIONS = { 'number': 20, 'message': 'Too many operations' };
const INVALID_OPERATION_VERSION = { 'number': 21, 'message': 'Invalid operation version' };
const INVALID_TIMESTAMP = { 'number': 22, 'message': "Timestamp can't be in the future" };
const INVALID_RECOVERY_CONNECTIONS = { 'number': 23, 'message': 'Request should be signed by 2 different recovery connections' };
const INVALID_HASH = { 'number': 24, 'message': 'Invalid operation hash' };
const OPERATION_APPLIED_BEFORE = { 'number': 25, 'message': 'The operation represented by operationHash: %s was applied before' };
const TOO_BIG_OPERATION = { 'number': 26, 'message': 'Operation is too big' };
const INVALID_GROUP_ID = { 'number': 27, 'message': 'Invalid group id: %s' };
const INVALID_INVITER = { 'number': 28, 'message': 'Inviter is not admin of group' };
const INELIGIBLE_NEW_USER = { 'number': 29, 'message': 'The new user is not eligible to join this group' };
const ALREADY_HAS_PRIMARY_GROUP = { 'number': 30, 'message': 'User already has a primary group' };
const NEW_USER_BEFORE_FOUNDERS_JOIN = { 'number': 31, 'message': 'New members can not be joined before founders join the group' };
const INVALID_DISMISSER = { 'number': 32, 'message': 'Dismisser is not admin of group' };
const INVALID_GROUP_TYPE = { 'number': 33, 'message': 'Invalid group type' };
const DUPLICATE_GROUP = { 'number': 34, 'message': 'Duplicate group' };
const INVALID_COFOUNDERS = { 'number': 35, 'message': 'One or both of the co-founders are not connected to the founder!' };
const FOUNDERS_PRIMARY_GROUP = { 'number': 36, 'message': 'Some of founders already have primary groups' };
const INELIGIBLE_NEW_ADMIN = { 'number': 37, 'message': 'New admin is not member of the group' };
const ADD_ADMIN_PERMISSION = { 'number': 38, 'message': 'Only admins can add new admins' };
const NOT_INVITED = { 'number': 39, 'message': 'The user not invited to join this group' };
const DELETE_GROUP_PERMISSION = { 'number': 40, 'message': 'Only admins can delete a group' };
const LEAVE_GROUP = { 'number': 41, 'message': 'Last admin can not leave the group' };
const DUPLICATE_CONTEXTID = { 'number': 42, 'message': 'ContextId: %s is duplicate' };
const TOO_MANY_LINK_REQUEST = { 'number': 43, 'message': 'Only three contextIds can be linked every 24 hours' };
const UNUSED_SPONSORSHIPS = { 'number': 44, 'message': 'The app: %s does not have unused sponsorships' };
const SPONSORED_BEFORE = { 'number': 45, 'message': 'The user is sponsored before' };
const FORBIDDEN_SPONSOR_REQUEST = { 'number': 46, 'message': 'Can not relay sponsor requests for this app: %s' };
const UPDATE_GROUP_PERMISSION = { 'number': 47, 'message': 'Only admins can update the group' };
const REPLACED_BRIGHTID = { 'number': 48, 'message': 'The new brightid replaced with the reported brightid not found' };

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
    this.errorNum = INVALID_SIGNATURE['number'];
    this.message = INVALID_SIGNATURE['message'];
  }
}

class AppNotFoundError extends NotFoundError {
  constructor(app) {
    super();
    this.errorNum = APP_NOT_FOUND['number'];
    this.message = util.format(APP_NOT_FOUND['message'], app);
    this.app = app;
  }
}

class TooManyOperationsError extends TooManyRequestsError {
  constructor() {
    super();
    this.errorNum = TOO_MANY_OPERATIONS['number'];
    this.message = TOO_MANY_OPERATIONS['message'];
  }
}

class InvalidOperationNameError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_OPERATION_NAME['number'];
    this.message = INVALID_OPERATION_NAME['message'];
  }
}

class InvalidOperationVersionError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_OPERATION_VERSION['number'];
    this.message = INVALID_OPERATION_VERSION['message'];
  }
}

class InvalidOperationTimestampError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_TIMESTAMP['number'];
    this.message = INVALID_TIMESTAMP['message'];
  }
}

class InvalidOperationHashError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_HASH['number'];
    this.message = INVALID_HASH['message'];
  }
}

class InvalidRecoveryConnectionsError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = INVALID_RECOVERY_CONNECTIONS['number'];
    this.message = INVALID_RECOVERY_CONNECTIONS['message'];
  }
}

class OperationNotFoundError extends NotFoundError {
  constructor(operationHash) {
    super();
    this.errorNum = OPERATION_NOT_FOUND['number'];
    this.message = util.format(OPERATION_NOT_FOUND['message'], operationHash);
    this.operationHash = operationHash;
  }
}

class OperationAppliedBeforeError extends BadRequestError {
  constructor(operationHash) {
    super();
    this.errorNum = OPERATION_APPLIED_BEFORE['number'];
    this.message = util.format(OPERATION_APPLIED_BEFORE['message'], operationHash);
    this.operationHash = operationHash;
  }
}

class TooBigOperationError extends BadRequestError {
  constructor() {
    super();
    this.errorNum = TOO_BIG_OPERATION['number'];
    this.message = TOO_BIG_OPERATION['message'];
  }
}

class UserNotFoundError extends NotFoundError {
  constructor(user) {
    super();
    this.errorNum = USER_NOT_FOUND['number'];
    this.message = util.format(USER_NOT_FOUND['message'], user);
    this.user = user;
  }
}

class ContextNotFoundError extends NotFoundError {
  constructor(context) {
    super();
    this.errorNum = CONTEXT_NOT_FOUND['number'];
    this.message = util.format(CONTEXT_NOT_FOUND['message'], context);
    this.context = context;
  }
}

class ContextIdNotFoundError extends NotFoundError {
  constructor(contextId) {
    super();
    this.errorNum = CONTEXTID_NOT_FOUND['number'];
    this.message = util.format(CONTEXTID_NOT_FOUND['message'], contextId);
    this.contextId = contextId;
  }
}

class GroupNotFoundError extends NotFoundError {
  constructor(group) {
    super();
    this.errorNum = GROUP_NOT_FOUND['number'];
    this.message = util.format(GROUP_NOT_FOUND['message'], group);
    this.group = group;
  }
}

class NotSponsoredError extends ForbiddenError {
  constructor(contextId) {
    super();
    this.errorNum = NOT_SPONSORED['number'];
    this.message = util.format(NOT_SPONSORED['message'], contextId);
    this.contextId = contextId;
  }
}

class CanNotBeVerifiedError extends NotFoundError {
  constructor(contextId, app) {
    super();
    this.errorNum = CAN_NOT_BE_VERIFIED['number'];
    this.message = util.format(CAN_NOT_BE_VERIFIED['message'], contextId, app);
    this.contextId = contextId;
    this.app = app;
  }
}

class InvalidExpressionError extends NotFoundError {
  constructor() {
    super();
    this.errorNum = INVALID_EXPRESSION['number'];
    this.message = INVALID_EXPRESSION['message'];
  }
}

class KeypairNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = KEYPAIR_NOT_SET['number'];
    this.message = KEYPAIR_NOT_SET['message'];
  }
}

class EthPrivatekeyNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = ETHPRIVATEKEY_NOT_SET['number'];
    this.message = ETHPRIVATEKEY_NOT_SET['message'];
  }
}

class IpNotSetError extends InternalServerError {
  constructor() {
    super();
    this.errorNum = IP_NOT_SET['number'];
    this.message = IP_NOT_SET['message'];
  }
}

class InvalidTestingKeyError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_TESTING_KEY['number'];
    this.message = INVALID_TESTING_KEY['message'];
  }
}

class PasscodeNotSetError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = PASSCODE_NOT_SET['number'];
    this.message = PASSCODE_NOT_SET['message'];
  }
}

class InvalidPasscodeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_PASSCODE['number'];
    this.message = INVALID_PASSCODE['message'];
  }
}

class InvalidGroupIdError extends BadRequestError {
  constructor(groupId) {
    super();
    this.errorNum = INVALID_GROUP_ID['number'];
    this.message = util.format(INVALID_GROUP_ID['message'], groupId);
    this.groupId = groupId;
  }
}

class InvalidInviterError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_INVITER['number'];
    this.message = INVALID_INVITER['message'];
  }
}

class IneligibleNewUserError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_NEW_USER['number'];
    this.message = INELIGIBLE_NEW_USER['message'];
  }
}

class AlreadyHasPrimaryGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ALREADY_HAS_PRIMARY_GROUP['number'];
    this.message = ALREADY_HAS_PRIMARY_GROUP['message'];
  }
}

class NewUserBeforeFoundersJoinError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NEW_USER_BEFORE_FOUNDERS_JOIN['number'];
    this.message = NEW_USER_BEFORE_FOUNDERS_JOIN['message'];
  }
}

class InvalidDismisserError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_DISMISSER['number'];
    this.message = INVALID_DISMISSER['message'];
  }
}

class InvalidGroupTypeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_GROUP_TYPE['number'];
    this.message = INVALID_GROUP_TYPE['message'];
  }
}

class DuplicateGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DUPLICATE_GROUP['number'];
    this.message = DUPLICATE_GROUP['message'];
  }
}

class InvalidCoFoundersError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INVALID_COFOUNDERS['number'];
    this.message = INVALID_COFOUNDERS['message'];
  }
}

class FoundersPrimaryGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = FOUNDERS_PRIMARY_GROUP['number'];
    this.message = FOUNDERS_PRIMARY_GROUP['message'];
  }
}

class IneligibleNewAdminError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = INELIGIBLE_NEW_ADMIN['number'];
    this.message = INELIGIBLE_NEW_ADMIN['message'];
  }
}

class AddAdminPermissionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = ADD_ADMIN_PERMISSION['number'];
    this.message = ADD_ADMIN_PERMISSION['message'];
  }
}

class NotInvitedError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = NOT_INVITED['number'];
    this.message = NOT_INVITED['message'];
  }
}

class DeleteGroupPermissionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = DELETE_GROUP_PERMISSION['number'];
    this.message = DELETE_GROUP_PERMISSION['message'];
  }
}

class LeaveGroupError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = LEAVE_GROUP['number'];
    this.message = LEAVE_GROUP['message'];
  }
}

class DuplicateContextIdError extends ForbiddenError {
  constructor(contextId) {
    super();
    this.errorNum = DUPLICATE_CONTEXTID['number'];
    this.message = util.format(DUPLICATE_CONTEXTID['message'], contextId);
    this.contextId = contextId;
  }
}

class TooManyLinkRequestError extends TooManyRequestsError {
  constructor() {
    super();
    this.errorNum = TOO_MANY_LINK_REQUEST['number'];
    this.message = TOO_MANY_LINK_REQUEST['message'];
  }
}

class UnusedSponsorshipsError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = UNUSED_SPONSORSHIPS['number'];
    this.message = util.format(UNUSED_SPONSORSHIPS['message'], app);
    this.app = app;
  }
}

class SponsoredBeforeError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = SPONSORED_BEFORE['number'];
    this.message = SPONSORED_BEFORE['message'];
  }
}

class ForbiddenSponsorError extends ForbiddenError {
  constructor(app) {
    super();
    this.errorNum = FORBIDDEN_SPONSOR_REQUEST['number'];
    this.message = util.format(FORBIDDEN_SPONSOR_REQUEST['message'], app);
    this.contextId = contextId;
  }
}

class UpdateGroupPermissionError extends ForbiddenError {
  constructor() {
    super();
    this.errorNum = UPDATE_GROUP_PERMISSION['number'];
    this.message = UPDATE_GROUP_PERMISSION['message'];
  }
}

class ReplacedBrightidError extends NotFoundError {
  constructor() {
    super();
    this.errorNum = REPLACED_BRIGHTID['number'];
    this.message = REPLACED_BRIGHTID['message'];
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