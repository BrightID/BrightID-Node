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
  {'collection': 'verifications', 'fields': ['user'], 'type': 'persistent'},
  {'collection': 'verifications', 'fields': ['name'], 'type': 'persistent'},
  {'collection': 'verifications', 'fields': ['block'], 'type': 'persistent'},
  {'collection': 'sponsorships', 'fields': ['expireDate'], 'type': 'ttl', 'expireAfter': 0},
  {'collection': 'sponsorships', 'fields': ['contextId'], 'type': 'persistent'},
  {'collection': 'connections', 'fields': ['level'], 'type': 'persistent'},
  {'collection': 'connectionsHistory', 'fields': ['timestamp'], 'type': 'persistent'},
  {'collection': 'groups', 'fields': ['seed'], 'type': 'persistent'},
  {'collection': 'operations', 'fields': ['state'], 'type': 'persistent'},
]

const variables = [
  { '_key': 'LAST_DB_UPGRADE', 'value': -1 },
  { '_key': 'VERIFICATIONS_HASHES', 'hashes': [] },
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

function v5_6_1() {
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

function v5_7() {
  console.log("change 'signingKey' to 'signingKeys' attribute in the users");
  query`
    FOR u IN users
      UPDATE { _key: u._key, signingKeys: [u.signingKey] } IN users`;

  query`
    FOR u IN users
      REPLACE UNSET(u, 'signingKey') IN users`;
}

function v5_8() {
  console.log("removing 'Yekta_0', 'Yekta_1', 'Yekta_2', 'Yekta_3', 'Yekta_4', 'Yekta_5' documents form verifications collection");
  const verificationsColl = arango._collection('verifications');
  for (let verificationName of ['Yekta_0', 'Yekta_1', 'Yekta_2', 'Yekta_3', 'Yekta_4', 'Yekta_5']) {
    verificationsColl.removeByExample({ name: verificationName });
  }

  console.log("adding block to verifications");
  block = variablesColl.document('VERIFICATION_BLOCK').value;
  query`
    FOR v in verifications
      UPDATE { _key: v._key, block: ${block} } IN verifications`;

  console.log("adding initTimestamp to connections");
  query`
    FOR c in connections
      UPDATE { _key: c._key, initTimestamp: (
        FOR ch in connectionsHistory
          FILTER ch._from == c._from AND ch._to == c._to
          SORT ch.timestamp
          LIMIT 1
          RETURN ch.timestamp
    )[0] } IN connections`;
}

function v5_9() {
  console.log("reducing 'recovery' level to 'just met' for connections that another side is not 'already known' or 'recovery'");
  const connectionsColl = arango._collection('connections');
  const connectionsHistoryColl = arango._collection('connectionsHistory');
  const now = Date.now();
  connectionsColl.byExample({
      level: 'recovery'
  }).toArray().forEach(ft => {
    const tf = connectionsColl.firstExample({
        _from: ft._to,
        _to: ft._from
    });
    if (!tf || !['already known', 'recovery'].includes(tf.level)) {
      db.connect({
        id1: ft._from.replace('users/', ''),
        id2: ft._to.replace('users/', ''),
        level: 'just met',
        timestamp: now
      });
    }
  });

  console.log("removing invalid contextIds form contexts' collection");
  const re = new RegExp(/^0[xX][A-Fa-f0-9]+$/);
  const contextsColl = arango._collection('contexts');
  contextsColl.all().toArray().map(context => {
    const contextColl = arango._collection(context.collection);
    if (!contextColl) {
      return;
    }
    const docs = contextColl.all().toArray();
    for (let doc of docs) {
      if (!doc.contextId || (context.idsAsHex && !re.test(doc.contextId))) {
        contextColl.removeByExample(doc);
      }
    }
  });
}

function v5_9_1() {
  let hashes = variablesColl.document('VERIFICATIONS_HASHES').hashes;
  new_hashes = {}
  for (let item of hashes) {
    new_hashes[item['block']] = item;
    delete item['block'];
  }
  variablesColl.update('VERIFICATIONS_HASHES', { hashes: new_hashes });
}

const upgrades = ['v5', 'v5_3', 'v5_5', 'v5_6', 'v5_6_1', 'v5_7', 'v5_8', 'v5_9', 'v5_9_1'];

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
