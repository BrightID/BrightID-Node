'use strict';

const aql = require('@arangodb').aql;
const db = require('@arangodb').db;
const errors = require('@arangodb').errors;

const operations = {
    addAndClean: function addAndClean(){},
    removeAndClean: function removeAndClean(){}
};

modules.exports = operations;