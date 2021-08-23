const arango = require('@arangodb').db;
const db = require('./db');
const { query } = require('@arangodb');

const collections = {
  'connections': 'edge',
  'connectionsHistory': 'edge',
  'groups': 'document',
  'usersInGroups': 'edge',
  'users': 'document',
  // this collection should be dropped when v5 drops
  'contexts': 'document',
  'apps': 'document',
  'sponsorships': 'edge',
  'operations': 'document',
  'operationsHashes': 'document',
  'invitations': 'edge',
  'variables': 'document',
  'verifications': 'document',
  // this collection should be dropped when v5 drops
  'testblocks': 'document',
  'cachedParams': 'document',
  'signedVerifications': 'document',
  'appIds': 'document',
  'seeds': 'document',
};

// deprecated collections should be added to this array after releasing
// second update to allow 2 last released versions work together
const deprecated = [
  'removed',
  'newGroups',
  'usersInNewGroups',
];

const indexes = [
  {'collection': 'verifications', 'fields': ['user'], 'type': 'persistent'},
  {'collection': 'verifications', 'fields': ['name'], 'type': 'persistent'},
  {'collection': 'verifications', 'fields': ['block'], 'type': 'persistent'},
  {'collection': 'sponsorships', 'fields': ['expireDate'], 'type': 'ttl', 'expireAfter': 0},
  {'collection': 'sponsorships', 'fields': ['contextId'], 'type': 'persistent'},
  {'collection': 'connections', 'fields': ['level'], 'type': 'persistent'},
  {'collection': 'connectionsHistory', 'fields': ['timestamp'], 'type': 'persistent'},
  {'collection': 'groups', 'fields': ['seed'], 'type': 'persistent'},
  {'collection': 'groups', 'fields': ['type'], 'type': 'persistent'},
  {'collection': 'groups', 'fields': ['head'], 'type': 'persistent'},
  {'collection': 'operations', 'fields': ['state'], 'type': 'persistent'},
  {'collection': 'cachedParams', fields: ['creationDate'], type: 'ttl', expireAfter: 600},
  {'collection': 'appIds', 'fields': ['uid'], 'type': 'persistent'},
  {'collection': 'appIds', 'fields': ['app', 'appId'], 'type': 'persistent'},
  {'collection': 'seeds', 'fields': ['user'], 'type': 'persistent'},
  {'collection': 'seeds', 'fields': ['type'], 'type': 'persistent'},
]

const variables = [
  { '_key': 'LAST_DB_UPGRADE', 'value': -1 },
  { '_key': 'VERIFICATIONS_HASHES', 'hashes': '{}' },
  { '_key': 'VERIFICATION_BLOCK', 'value': 0 },
  // 2021/02/09 as starting point for applying new seed connected
  { '_key': 'PREV_SNAPSHOT_TIME', 'value': 1612900000 },
]

const variablesColl = arango._collection('variables');

function createCollections() {
  console.log("creating collections if they do not exist ...");
  for (let collection in collections) {
    const coll = arango._collection(collection);
    if (coll) {
      console.log(`${collection} exists`);
    } else {
      const type = collections[collection];
      arango._create(collection, {}, type);
      console.log(`${collection} created with type ${type}`);
    }
  };
}

function createIndexes() {
  console.log("creating indexes ...");
  for (let index of indexes) {
    const coll = arango._collection(index.collection);
    console.log(`${index.fields} indexed in ${index.collection} collection`);
    delete index.collection;
    coll.ensureIndex(index);
  };
}

function removeDeprecatedCollections() {
  console.log("removing deprecated collections");
  for (let collection of deprecated) {
    const coll = arango._collection(collection);
    if (coll) {
      arango._drop(collection);
      console.log(`${collection} dropped`);
    } else {
      console.log(`${collection} dropped before`);
    }
  }
}

function initializeVariables() {
  console.log("initialize variables ...");
  for (let variable of variables) {
    if (! variablesColl.exists(variable._key)) {
      variablesColl.insert(variable);
    }
  }
}

function v6_1() {
  console.log('creating seeds collection')
  const groupsColl = arango._collection('groups');
  const usersInGroupsColl = arango._collection('usersInGroups');
  const starGroups = [
    'PbtXC7NF5bhiyrDoCShlg3iKK3d9bto_uxg9B4BGv9E',
    'jutFlbXP0eJnJ2sPT8aibSYdYVde9XQZ_i-z96N9r1w',
    'vPmP-pkagrl02LrGgIaFf4aimR4rTrbnIcYT5t7q2w4',
    'bSGdH_RTE9CbHvBpx3Y08OUE0cw7fexp7y0M-9pD4S0',
  ];

  groupsColl.byExample({
    seed: true
  }).toArray().forEach(g => {
    const members = usersInGroupsColl.byExample({
      _to: `groups/${g._key}`
    }).toArray();
    if (starGroups.includes(g._key)) {
      // remove star groups
      groupsColl.update(g._key, { seed: false, quota: 0 });

      members.forEach(m => {
        const user = m._from.replace('users/', '')
        query`
          UPSERT {
            user: ${user},
            type: 'star',
          }
          INSERT {
            user: ${user},
            type: 'star',
            quota: 0,
            timestamp: ${g.timestamp},
          }
          UPDATE {} IN seeds`
      });
    } else {
      members.forEach(m => {
        const user = m._from.replace('users/', '')
        query`
          UPSERT {
            user: ${user},
            type: 'community',
            group: ${g._key}
          }
          INSERT {
            user: ${user},
            type: 'community',
            community: ${g.region || ''},
            group: ${g._key},
            quota: ${g.quota ? Math.ceil(g.quota / members.length) : 0},
            timestamp: ${g.timestamp},
          }
          UPDATE {} IN seeds`
      });
    }
  });
}

const upgrades = ['v6_1'];

function initdb() {
  createCollections();
  createIndexes();
  removeDeprecatedCollections();
  initializeVariables();
  let index;
  if (variablesColl.exists('LAST_DB_UPGRADE')) {
    upgrade = variablesColl.document('LAST_DB_UPGRADE').value;
    index = upgrades.indexOf(upgrade) + 1;
  } else {
    index = 0;
  }
  while (upgrades[index]) {
    eval(upgrades[index])();
    variablesColl.update('LAST_DB_UPGRADE', { value: upgrades[index] });
    index += 1;
  }
}

initdb();
