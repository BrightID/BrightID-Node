const { query, db } = require('@arangodb');
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

function v5() {
  const contextsColl = db._collection('contexts');
  const appsColl = db._collection('apps');
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
  const sponsorshipsColl = db._collection('sponsorships');
  const sponsorships = sponsorshipsColl.all().toArray();
  for (let sponsorship of sponsorships) {
    sponsorshipsColl.update(sponsorship, {
      _to: sponsorship['_to'].replace('contexts/', 'apps/')
    });
  }
}

const upgrades = ['v5'];

function initdb() {
  createCollections();
  removeDeprecatedCollections();
  variablesColl = db._collection('variables');
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

module.exports = {
  initdb,
};
