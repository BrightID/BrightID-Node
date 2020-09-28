const { query, db } = require('@arangodb');
const collections = {
  'connections': 'edge',
  'groups': 'document',
  'usersInGroups': 'edge',
  'users': 'document',
  'contexts': 'document',
  'sponsorships': 'edge',
  'operations': 'document',
  'operationsHashes': 'document',
  'invitations': 'edge',
  'variables': 'document',
};

// deprecated collections should be added to this array after releasing
// second update to allow 2 last released versions work together 
const deprecated = [
  'removed',
  'newGroups',
  'usersInNewGroups',
];

function createCollections() {
  console.log("creating collections if they don't exist ...");
  for (let collection in collections) {
    const coll = db._collection(collection);
    if (coll) {
      console.log(`${collection} exists`);
    } else {
      const type = collections[collection];
      db._create(collection, {}, type);
      console.log(`${collection} created with type ${type}`);
    }
  };
}

function removeDeprecatedCollections() {
  console.log("removing deprecated collections");
  for (let collection of deprecated) {
    const coll = db._collection(collection);
    if (coll) {
      db._drop(collection);
      console.log(`${collection} dropped`);
    } else {
      console.log(`${collection} dropped before`);
    }

  }
}

function initdb() {
  createCollections();
  removeDeprecatedCollections();
}

initdb();
