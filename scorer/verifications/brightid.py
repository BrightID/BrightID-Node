import time
from arango import ArangoClient
from . import utils
import config


def verify(fname):
    print('BRIGHTID')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
    already_verifieds = {v['user']
                         for v in db['verifications'].find({'name': 'BrightID'})}
    candidates = list(snapshot_db['verifications'].find(
        {'name': 'SeedConnected'}))

    for candidate in candidates:
        if candidate['user'] in already_verifieds or candidate['rank'] < 1:
            continue

        db['verifications'].insert({
            'name': 'BrightID',
            'user': candidate['user'],
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('BrightID', candidate['user'])
        })
    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
