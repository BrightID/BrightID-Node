const arango = require('@arangodb').db;
const db = require('./db');

const collections = {
  'connections': 'edge',
  'groups': 'document',
  'usersInGroups': 'edge',
  'users': 'document',
  'contexts': 'document',
  'apps': 'document',
  'sponsorships': 'edge',
  'operations': 'document',
  'operationsHashes': 'document',
  'invitations': 'edge',
  'variables': 'document',
  'verifications': 'document',
};

// deprecated collections should be added to this array after releasing
// second update to allow 2 last released versions work together 
const deprecated = [
  'removed',
  'newGroups',
  'usersInNewGroups',
];

const indexes = [
  {'collection': 'verifications',  'fields': ['name']},
  {'collection': 'verifications',  'fields': ['user']}
]

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
    coll.ensureIndex({type: 'persistent', fields: index.fields})
    console.log(`${index.fields} indexed in ${index.collection} collection`);
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

function v5() {
  const contextsColl = arango._collection('contexts');
  const appsColl = arango._collection('apps');
  const contexts = contextsColl.all().toArray();
  for (let context of contexts) {
    appsColl.insert({
      _key: context['_key'],
      name: context['_key'],
      context: context['_key'],
      url: context['appUrl'],
      logo: context['appLogo'],
      totalSponsorships: context['totalSponsorships'],
      sponsorPublicKey: context['sponsorPublicKey'],
      sponsorPrivateKey: context['sponsorPrivateKey'],
      sponsorEventContract: context['contractAddress'],
      wsProvider: context['wsProvider'] || 'wss://mainnet.infura.io/ws/v3/36e48f8228ad42a297049cabc1101324',
    });
    contextsColl.replace(context, {
      collection: context['collection'],
      verification: context['verification'],
      linkAESKey: context['linkAESKey'],
      idsAsHex: context['idsAsHex'],
      ethName: context['ethName']
    });
  }
  const sponsorshipsColl = arango._collection('sponsorships');
  const sponsorships = sponsorshipsColl.all().toArray();
  for (let sponsorship of sponsorships) {
    sponsorshipsColl.update(sponsorship, {
      _to: sponsorship['_to'].replace('contexts/', 'apps/')
    });
  }
}

function v5_3() {
  const usersColl = arango._collection('users');
  const connectionsColl = arango._collection('connections');
  const timestamp = Date.now();

  connectionsColl.all().toArray().forEach(conn => {
    const key1 = conn._from.replace('users/', '');
    const key2 = conn._to.replace('users/', '');
    if (conn.timestamp < 1597276800000) {
        // 08/13/2020 12:00am (UTC)
        db.connect(key1, key2, 'already know', null, conn.timestamp);
        db.connect(key2, key1, 'already know', null, conn.timestamp);
    } else {
        db.connect(key1, key2, 'just met', null, conn.timestamp);
        db.connect(key2, key1, 'just met', null, conn.timestamp);
    }

  });
  usersColl.all().toArray().forEach(user => {
    if (user.trusted) {
      for (let conn of user.trusted) {
        db.connect(user._key, conn, 'recovery', null, user.updateTime);
      }
    }
    if (user.flaggers) {
      for (let flagger in user.flaggers) {
        db.connect(flagger, user._key, 'spam', user.flaggers[flagger], timestamp);
      }
    }
  });
}

const upgrades = ['v5', 'v5_3'];

function initdb() {
  createCollections();
  createIndexes();
  removeDeprecatedCollections();
  variablesColl = arango._collection('variables');
  let index;
  if (variablesColl.exists('LAST_DB_UPGRADE')) {
    upgrade = variablesColl.document('LAST_DB_UPGRADE').value;
    index = upgrades.indexOf(upgrade) + 1;
  } else {
    variablesColl.insert({ _key: 'LAST_DB_UPGRADE', value: -1 });
    index = 0;
  }
  while (upgrades[index]) {
    eval(upgrades[index])();
    variablesColl.update('LAST_DB_UPGRADE', { value: upgrades[index] });
    index += 1;
  }
}

initdb();