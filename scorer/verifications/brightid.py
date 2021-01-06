import time
from arango import ArangoClient
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
        if candidate['user'] in already_verifieds or candidate['score'] < 1:
            continue

        db['verifications'].insert({
            'name': 'BrightID',
            'user': candidate['user'],
            'timestamp': int(time.time() * 1000)
        })
    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
