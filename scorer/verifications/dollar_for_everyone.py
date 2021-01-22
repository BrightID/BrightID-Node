import time
from arango import ArangoClient
from . import utils
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']


def verify(block):
    print('DOLLAR FOR EVERYONE')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')

    admins = [u['_id'] for u in snapshot_db['users'].find({'dfeAdmin': True})]
    verifieds = snapshot_db.aql.execute('''
        FOR c IN connections
            FILTER c._from IN @admins
                AND c.level IN @levels
                AND c.timestamp > @time_limit
                RETURN c._to
    ''', bind_vars={
        'admins': admins,
        'levels': SEED_CONNECTION_LEVELS,
        'time_limit': 1564600000000
    })

    for verified in verifieds:
        verified = verified.replace('users/', '')
        db['verifications'].insert({
            'name': 'DollarForEveryone',
            'user': verified,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('DollarForEveryone', verified)
        })

    verifiedCount = db['verifications'].find(
        {'name': 'DollarForEveryone', 'block': block}).count()
    print('verifieds: {}\n'.format(verifiedCount))
