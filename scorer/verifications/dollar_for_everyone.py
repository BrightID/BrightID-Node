import time
from arango import ArangoClient
import utils

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']


def verify(fname):
    print('DOLLAR FOR EVERYONE')
    db = ArangoClient().db('_system')

    verifications_documents = utils.documents(fname, 'verifications')
    verifications = {}
    for d in verifications_documents:
        if d['user'] not in verifications:
            verifications[d['user']] = []
        verifications[d['user']].append(d['name'])

    users_documents = utils.documents(fname, 'users')
    admins = filter(lambda u: u.get('dfeAdmin', False), users_documents)
    admins = [a['_id'] for a in admins]

    connections_documents = utils.documents(fname, 'connections')
    connections = filter(lambda c: c['_from'] in admins and c['level']
                         in SEED_CONNECTION_LEVELS and c['timestamp'] > 1564600000000, connections_documents)
    neighbors = set([c['_to'].replace('users/', '') for c in connections])
    for neighbor in neighbors:
        if 'DollarForEveryone' not in verifications.get(neighbor, []):
            db['verifications'].insert({
                'name': 'DollarForEveryone',
                'user': neighbor,
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: DollarForEveryone'.format(neighbor))
    verifiedCount = db['verifications'].find(
        {'name': 'DollarForEveryone'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
