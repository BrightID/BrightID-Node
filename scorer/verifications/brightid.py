import time
from arango import ArangoClient
from .utils import documents


def verify(fname, past_block, current_block):
    print('BRIGHTID')
    db = ArangoClient().db('_system')
    verifications = {}
    verifications_documents = documents(fname, 'verifications')
    for d in verifications_documents:
        if d['user'] not in verifications:
            verifications[d['user']] = []
        verifications[d['user']].append(d['name'])

    users = documents(fname, 'users')

    for u in users:
        if 'SeedConnected' not in verifications.get(u['_key'], []):
            continue
        db['verifications'].insert({
            'name': 'BrightID',
            'user': u['_key'],
            'timestamp': int(time.time() * 1000),
            'block': current_block
        })
    verifiedCount = db['verifications'].find(
        {'name': 'BrightID', 'block': current_block}).count()
    print(f'verifieds: {verifiedCount}\n')
