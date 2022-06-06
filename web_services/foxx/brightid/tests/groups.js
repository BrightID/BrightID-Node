"use strict";

const db = require("../db.js");
const errors = require("../errors.js");
const arango = require("@arangodb").db;
const { hash } = require("../encoding");

const connectionsColl = arango._collection("connections");
const groupsColl = arango._collection("groups");
const usersInGroupsColl = arango._collection("usersInGroups");
const usersColl = arango._collection("users");
const invitationsColl = arango._collection("invitations");

const chai = require("chai");
const should = chai.should();
const expect = chai.expect;
const url = "http://url.com/dummy";

describe("groups", function () {
  before(function () {
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    invitationsColl.truncate();
    db.createUser("a");
    db.createUser("b");
    db.createUser("c");
    db.createUser("d");
    db.createUser("e");
  });

  after(function () {
    usersColl.truncate();
    connectionsColl.truncate();
    groupsColl.truncate();
    usersInGroupsColl.truncate();
    invitationsColl.truncate();
  });

  describe("creation", function () {
    it("users should be able to create a group", function () {
      db.createGroup("g1", "b", url, "general", Date.now());
      groupsColl.count().should.equal(1);
      const group = groupsColl.any();
      group._key.should.equal("g1");
    });
    it("admin of the group should be able to delete it", function () {
      db.deleteGroup("g1", "b", Date.now());
      groupsColl.count().should.equal(0);
    });
  });

  describe("invitation and joining", function () {
    before(function () {
      db.createGroup("g3", "a", url, "general", Date.now());
    });
    it("no one should be able to join a group without invitation", function () {
      (() => {
        db.addMembership("g3", "d", Date.now());
      }).should.throw(errors.NotInvitedError);
    });
    it("admins should be able to invite any user to the group", function () {
      db.invite("a", "d", "g3", "data", Date.now());
      db.userInvites("d")
        .map((invite) => invite.group)
        .should.deep.equal(["g3"]);
    });
    it("invited user should be able to join the group", function () {
      db.addMembership("g3", "d", Date.now());
      db.groupMembers("g3").should.include("d");
      db.userInvites("d").length.should.equal(0);
    });
    it("non-admins should not be able to invite others to the group", function () {
      (() => {
        db.invite("d", "e", "g3", "data", Date.now());
      }).should.throw(errors.NotAdminError);
    });
  });

  describe("dismissing and leaving", function () {
    before(function () {
      db.invite("a", "b", "g3", "data", Date.now());
      db.invite("a", "d", "g3", "data", Date.now());
      db.invite("a", "e", "g3", "data", Date.now());
      db.addMembership("g3", "b", Date.now());
      db.addMembership("g3", "d", Date.now());
      db.addMembership("g3", "e", Date.now());
    });
    it("users should be able to leave the group", function () {
      db.deleteMembership("g3", "b", Date.now());
      db.groupMembers("g3").should.not.include("b");
      usersInGroupsColl.count().should.equal(3);
    });
    it("non-admins should not be able to dismiss others from the group", function () {
      (() => {
        db.dismiss("d", "e", "g3", Date.now());
      }).should.throw(errors.NotAdminError);
    });
    it("admins should be able to dismiss others from the group", function () {
      db.dismiss("a", "d", "g3", Date.now());
      db.groupMembers("g3").should.not.include("d");
    });
  });

  describe("adding new admins", function () {
    before(function () {
      db.invite("a", "d", "g3", "data", Date.now());
      db.addMembership("g3", "d", Date.now());
    });
    it("non-admins should not be able to add new admins", function () {
      (() => {
        db.addAdmin("e", "d", "g3", Date.now());
      }).should.throw(errors.NotAdminError);
    });
    it("admins should be able to add new admins", function () {
      db.addAdmin("a", "d", "g3", Date.now());
      groupsColl.document("g3").admins.should.include("d");
    });
    it("admins should be removed from admins list when they leave the group", function () {
      groupsColl.document("g3").admins.should.include("d");
      db.deleteMembership("g3", "d", Date.now());
      groupsColl.document("g3").admins.should.not.include("d");
    });
  });

  describe("family groups", function () {
    before(function () {
      usersColl.truncate();
      connectionsColl.truncate();
      groupsColl.truncate();
      usersInGroupsColl.truncate();
      invitationsColl.truncate();
      db.connect({
        id1: "a1",
        id2: "b1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "b1",
        id2: "a1",
        level: "recovery",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "a1",
        id2: "c1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "c1",
        id2: "a1",
        level: "already known",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "d1",
        id2: "e1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "e1",
        id2: "d1",
        level: "recovery",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "d1",
        id2: "a1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "a1",
        id2: "d1",
        level: "already known",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "a1",
        id2: "e1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "e1",
        id2: "a1",
        level: "already known",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "f1",
        id2: "e1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "e1",
        id2: "f1",
        level: "already known",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "f1",
        id2: "a1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "a1",
        id2: "f1",
        level: "recovery",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "f1",
        id2: "d1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "d1",
        id2: "f1",
        level: "already known",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "e1",
        id2: "h1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "h1",
        id2: "e1",
        level: "already known",
        timestamp: Date.now(),
      });

      db.connect({
        id1: "e1",
        id2: "i1",
        level: "already known",
        timestamp: Date.now(),
      });
      db.connect({
        id1: "i1",
        id2: "e1",
        level: "already known",
        timestamp: Date.now(),
      });
    });
    it("users should be able to found a family group", function () {
      db.createGroup("fg1", "a1", url, "family", Date.now());
      groupsColl.count().should.equal(1);
    });
    it("admins should be able to invite users which connected to all family group members", function () {
      db.invite("a1", "b1", "fg1", "data", Date.now());
      db.groupInvites("fg1").length.should.equal(1);
    });
    it("invited users which connected to all family group members should be able to join the group", function () {
      db.addMembership("fg1", "b1", Date.now());
      const members = db.groupMembers("fg1");
      members.should.include("a1");
      members.should.include("b1");
      members.length.should.equal(2);
    });
    it("users that are not connected to all members of the family groups should not be able to invite to the family group", function () {
      (() => {
        db.invite("a1", "c1", "fg1", "data", Date.now());
      }).should.throw(errors.IneligibleFamilyMember);
    });
    it("admins of a family should be able to set an eligible user as head of the family", function () {
      db.setFamilyHead("a1", "a1", "fg1");
      const group = db.getGroup("fg1");
      group.head.should.equal("a1");
    });
    it("head of a family group should be able be member of another family group", function () {
      db.createGroup("fg2", "d1", url, "family", Date.now());
      db.invite("d1", "a1", "fg2", "data", Date.now());
      db.addMembership("fg2", "a1", Date.now());
      db.userMemberships("a1")
        .map((group) => group.id)
        .should.deep.equal(["fg1", "fg2"]);
      groupsColl.count().should.equal(2);
    });
    it("users that are member of family groups should not be able to invited to other family groups", function () {
      (() => {
        db.invite("d1", "b1", "fg2", "data", Date.now());
      }).should.throw(errors.AlreadyIsFamilyMember);
    });
    it("family groups that do not have heads, ineligible to vouch for", function () {
      (() => {
        db.vouchFamily("f1", "fg2", Date.now());
      }).should.throw(errors.IneligibleToVouch);
    });
    it("ineligible users should not be able to vouch family groups", function () {
      (() => {
        db.userFamiliesToVouch("e1").should.not.include("fg1");
        db.vouchFamily("e1", "fg1", Date.now());
      }).should.throw(errors.IneligibleToVouchFor);
    });
    it("eligible users should be able to vouch family groups", function () {
      db.setFamilyHead("d1", "d1", "fg2");
      db.userFamiliesToVouch("e1").should.include("fg2");
      db.vouchFamily("e1", "fg2", Date.now());
      groupsColl.document("fg2").vouchers.should.include("e1");
    });
    it("any changes in members of a family group should remove all already submitted vouches and vouchers should vouch again if they still eligible", function () {
      groupsColl.document("fg2").vouchers.should.include("e1");
      db.invite("d1", "f1", "fg2", "data", Date.now());
      db.addMembership("fg2", "f1", Date.now());
      groupsColl.document("fg2").vouchers.length.should.equal(0);
      db.userFamiliesToVouch("e1").should.include("fg2");
      db.vouchFamily("e1", "fg2", Date.now());
      groupsColl.document("fg2").vouchers.should.include("e1");
    });
    it("general groups should not be able to convert to a family if members already are members of another family", function () {
      (() => {
        db.createGroup("g3", "e1", url, "general", Date.now());
        db.invite("e1", "a1", "g3", "data", Date.now());
        db.addMembership("g3", "a1", Date.now());
        db.convertToFamily("e1", "e1", "g3", Date.now());
      }).should.throw(errors.AlreadyIsFamilyMember);
    });
    it("general groups should not be able to convert to a family if all members are not connected to each other", function () {
      (() => {
        db.createGroup("g4", "e1", url, "general", Date.now());
        db.invite("e1", "i1", "g4", "data", Date.now());
        db.addMembership("g4", "i1", Date.now());
        db.invite("e1", "h1", "g4", "data", Date.now());
        db.addMembership("g4", "h1", Date.now());
        db.convertToFamily("e1", "e1", "g4", Date.now());
      }).should.throw(errors.IneligibleFamilyMember);
    });
    it("admins of eligible general groups should be able to convert it to family", function () {
      db.createGroup("g5", "e1", url, "general", Date.now());
      db.invite("e1", "f1", "g5", "data", Date.now());
      db.addMembership("g5", "f1", Date.now());
      let group = db.getGroup("g5");
      group.type.should.equal("general");
      db.convertToFamily("e1", "f1", "g5", Date.now());
      group = db.getGroup("g5");
      group.type.should.equal("family");
      group.head.should.equal("f1");
    });
  });
});
