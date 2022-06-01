"use strict";

const operations = require("../operations.js");
const db = require("../db.js");
const errors = require("../errors");
const arango = require("@arangodb").db;

const usersColl = arango._collection("users");
const connectionsColl = arango._collection("connections");
const verificationsColl = arango._collection("verifications");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chai = require("chai");
const should = chai.should();

describe("time window", function () {
  before(function () {
    usersColl.truncate();
    connectionsColl.truncate();
    verificationsColl.truncate();
    usersColl.insert({ _key: "a" });
    usersColl.insert({ _key: "b" });
    usersColl.insert({ _key: "c" });
    verificationsColl.insert({ name: "BrightID", user: "a" });
  });
  after(function () {
    usersColl.truncate();
    connectionsColl.truncate();
    verificationsColl.truncate();
  });
  it("should get error after limit", function () {
    operations.checkLimits({ name: "Add Group", id: "a" }, 100, 2);
    operations.checkLimits({ name: "Remove Group", id: "a" }, 100, 2);
    (() => {
      operations.checkLimits({ name: "Add Membership", id: "a" }, 100, 2);
    }).should.throw(errors.TooManyOperationsError);
  });
  it("limit should be removed after time window passed", function () {
    // for some reason setTimeout is not working
    const now = Date.now();
    while (Date.now() - now <= 100);
    operations.checkLimits({ name: "Remove Group", id: "a" }, 100, 2);
  });
  it("unverified users should have shared limit", function () {
    const now = Date.now();
    while (Date.now() - now <= 100);
    operations.checkLimits({ name: "Add Group", id: "b" }, 100, 2);
    operations.checkLimits({ name: "Add Group", id: "c" }, 100, 2);
    (() => {
      operations.checkLimits({ name: "Add Membership", id: "b" }, 100, 2);
    }).should.throw(errors.TooManyOperationsError);
  });
  it("connecting to first verified user should set parent", function () {
    db.connect({ id1: "a", id2: "c", level: "just met", timestamp: 1 });
    usersColl.document("c").parent.should.equal("a");
  });
  it("unverified users with parent should have different limit", function () {
    (() => {
      operations.checkLimits({ name: "Add Membership", id: "b" }, 100, 2);
    }).should.throw(errors.TooManyOperationsError);
    operations.checkLimits({ name: "Add Group", id: "c" }, 100, 2);
    operations.checkLimits({ name: "Add Group", id: "c" }, 100, 2);
    (() => {
      operations.checkLimits({ name: "Add Membership", id: "c" }, 100, 2);
    }).should.throw(errors.TooManyOperationsError);
  });
});
