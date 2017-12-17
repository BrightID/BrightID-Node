"use strict";

const graph_module = require('@arangodb/general-graph');

describe('contacts graph', function(){
    var contacts = graph_module._graph("contacts");
    describe('users collection', function(){
        it('should be able to create a user', function(){
            contacts.users.save({_key: 'foo'});
        });
        it("shouldn't create a contact edge if a user doesn't exist", function(){
            contacts.contacts.save('users/foo','users/bar',{"timestamp": new Date()});
        });
    });
});



