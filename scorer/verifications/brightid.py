import time
from arango import ArangoClient
import utils


def verify(fname):
    print('BRIGHTID')
    db = ArangoClient().db('_system')
    verifications = {}
    verifications_documents = utils.documents(fname, 'verifications')
    for d in verifications_documents:
        if d['user'] not in verifications:
            verifications[d['user']] = []
        verifications[d['user']].append(d['name'])

    users = utils.documents(fname, 'users')

    for u in users:
        if 'SeedConnected' not in verifications.get(u['_key'], []):
            continue
        if 'BrightID' not in verifications[u['_key']]:
            db['verifications'].insert({
                'name': 'BrightID',
                'user': u['_key'],
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: BrightID'.format(u['_key']))
    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
