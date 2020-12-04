import time
from arango import ArangoClient
from .utils import documents

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']


def verify(fname, past_block, current_block):
    print('DOLLAR FOR EVERYONE')
    users_documents = documents(fname, 'users')
    admins = filter(lambda u: u.get('dfeAdmin', False), users_documents)
    admins = [a['_id'] for a in admins]

    connections_documents = documents(fname, 'connections')
    connections = filter(lambda c: c['_from'] in admins and c['level']
                         in SEED_CONNECTION_LEVELS and c['timestamp'] > 1564600000000, connections_documents)

    db = ArangoClient().db('_system')
    neighbors = set([c['_to'].replace('users/', '') for c in connections])
    for neighbor in neighbors:
        db['verifications'].insert({
            'name': 'DollarForEveryone',
            'user': neighbor,
            'timestamp': int(time.time() * 1000),
            'block': current_block
        })
    verifiedCount = db['verifications'].find(
        {'name': 'DollarForEveryone', 'block': current_block}).count()
    print('verifieds: {}\n'.format(verifiedCount))
