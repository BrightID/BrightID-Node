"use strict";

const contacts = require('../db.js');

describe('contacts graph', function () {
  it('should be able to create a connection', function () {
    contacts.addAndClean('a', 'b', Date.now());
  });
  it("should be able to remove a connection", function () {
    contacts.removeAndClean('b', 'a', Date.now());
  });
  it("should be able to re-add a connection", function () {
    contacts.addAndClean('b', 'a', Date.now());
  });
  it("should be able to re-remove a connection", function () {
    contacts.removeAndClean('a', 'b', Date.now());
  })
});



