const arango = require('@arangodb').db;
const db = require('./db');
const { query } = require('@arangodb');

const collections = {
  'connections': 'edge',
  'connectionsHistory': 'edge',
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
  'testblocks': 'document'
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
      db.connect({
        id1: key1,
        id2: key2,
        level: 'already known',
        timestamp: conn.timestamp
      });
      db.connect({
        id1: key2,
        id2: key1,
        level: 'already known',
        timestamp: conn.timestamp
      });
    } else {
      db.connect({
        id1: key1,
        id2: key2,
        level: 'just met',
        timestamp: conn.timestamp
      });
      db.connect({
        id1: key2,
        id2: key1,
        level: 'just met',
        timestamp: conn.timestamp
      });
    }

  });
  usersColl.all().toArray().forEach(user => {
    if (user.trusted) {
      for (let conn of user.trusted) {
        db.connect({
          id1: user._key,
          id2: conn,
          level: 'recovery',
          timestamp: user.updateTime
        });
      }
    }
    if (user.flaggers) {
      for (let flagger in user.flaggers) {
        db.connect({
          id1: flagger,
          id2: user._key,
          level: 'reported',
          reportReason: user.flaggers[flagger],
          timestamp
        });
      }
    }
  });
}

function v5_5() {
  console.log("add current connections to the connectionsHistory");
  const connectionsColl = arango._collection('connections');
  const connectionsHistoryColl = arango._collection('connectionsHistory');
  connectionsColl.all().toArray().forEach(conn => {
    connectionsHistoryColl.insert({
      _from: conn['_from'],
      _to: conn['_to'],
      level: conn['level'],
      reportReason: conn['reportReason'],
      replacedWith: conn['replacedWith'],
      requestProof: conn['requestProof'],
      timestamp: conn['timestamp']
    });
  });

  console.log("removing 'score' attribute form groups collection");
  const groupsColl = arango._collection('groups');
  query`
    FOR doc IN ${groupsColl}
      REPLACE UNSET(doc, 'score') IN ${groupsColl}`;

  console.log("removing 'score', 'verifications', 'flaggers', 'trusted' attributes form users collection");
  const usersColl = arango._collection('users');
  query`
    FOR doc IN ${usersColl}
      REPLACE doc WITH UNSET(doc, 'score', 'verifications', 'flaggers', 'trusted') IN ${usersColl}`;

  console.log("removing 'verification' attribute form contexts collection");
  const contextsColl = arango._collection('contexts');
  query`
    FOR doc IN ${contextsColl}
      REPLACE doc WITH UNSET(doc, 'verification') IN ${contextsColl}`;

  console.log("removing 'Yekta_0', 'Yekta_1', 'Yekta_2', 'Yekta_3', 'Yekta_4', 'Yekta_5' documents form verifications collection");
  const verificationsColl = arango._collection('verifications');
  for (let verificationName of ['Yekta_0', 'Yekta_1', 'Yekta_2', 'Yekta_3', 'Yekta_4', 'Yekta_5']) {
    verificationsColl.removeByExample({ name: verificationName });
  }
}

function v5_6() {
  console.log("removing 'verification' attribute form contexts collection");
  const contextsColl = arango._collection('contexts');
  query`
    FOR doc IN ${contextsColl}
      REPLACE doc WITH UNSET(doc, 'verification') IN ${contextsColl}`;

  console.log("removing 'ethName' attribute form context collection");
  query`
    FOR doc IN ${contextsColl}
      REPLACE UNSET(doc, 'ethName') IN ${contextsColl}`;
}

function v5_7() {
  console.log("use _key instead of _id in admins and founders of groups");
  const groupsColl = arango._collection('groups');
  const groups = groupsColl.all().toArray();
  for (let group of groups) {
    groupsColl.update(group, {
      'founders': group.founders.map(f => f.replace('users/', '')),
      'admins': (group.admins || group.founders).map(a => a.replace('users/', ''))
    });
  }
}

const upgrades = ['v5', 'v5_3', 'v5_5', 'v5_6', 'v5_7'];

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