"use strict";

const db = require('../db.js');

describe('db graph', function () {
  it('should be able to create a connection', function () {
    db.addConnection('a', 'b', Date.now());
  });
  it("should be able to remove a connection", function () {
    db.removeConnection('b', 'a', Date.now());
  });
  it("should be able to re-add a connection", function () {
    db.addConnection('b', 'a', Date.now());
  });
  it("should be able to re-remove a connection", function () {
    db.removeConnection('a', 'b', Date.now());
  })
});



