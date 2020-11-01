import time
from arango import ArangoClient
import utils

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']


def verify(fname):
    print('DOLLAR FOR EVERYONE')
    db = ArangoClient().db('_system')
    connections_tbl = utils.zip2dict(fname, 'connections')
    verifications_tbl = utils.zip2dict(fname, 'verifications')
    users_tbl = utils.zip2dict(fname, 'users')
    admins = filter(lambda u: u.get('dfeAdmin', False), users_tbl)
    admins = [a['_id'] for a in admins]
    conns = filter(lambda c: c['_from'] in admins and c['level'] in SEED_CONNECTION_LEVELS and c['timestamp'] > 1564600000000, connections_tbl)
    neighbors = set([conn['_to'].replace('users/', '') for conn in conns])
    for neighbor in neighbors:
        verifications = filter(lambda v: v['user'] == neighbor, verifications_tbl)
        verifications = [v['name'] for v in verifications]
        if 'DollarForEveryone' not in verifications:
            db['verifications'].insert({
                'name': 'DollarForEveryone',
                'user': neighbor,
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: DollarForEveryone'.format(neighbor))
    verifiedCount = db['verifications'].find(
        {'name': 'DollarForEveryone'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
