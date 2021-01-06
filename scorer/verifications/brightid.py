import time
from arango import ArangoClient
import config

def verify(fname):
    print('BRIGHTID')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
    verifieds = {v['user']
                 for v in db['verifications'].find({'name': 'BrightID'})}

    for user in snapshot_db['users']:
        if user['_key'] in verifieds:
            continue

        c = snapshot_db['verifications'].find({
            'user': user['_key'],
            'name': 'SeedConnected'
        })
        if c.empty() or c.batch()[0].get('score', 0) < 1:
            continue

        db['verifications'].insert({
            'name': 'BrightID',
            'user': user['_key'],
            'timestamp': int(time.time() * 1000)
        })
    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
