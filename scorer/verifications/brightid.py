import time
from arango import ArangoClient
import utils


def verify(fname):
    print('BRIGHTID')
    db = ArangoClient().db('_system')
    verifications_tbl = utils.zip2dict(fname, 'verifications')
    users_tbl = utils.zip2dict(fname, 'users')
    for u in users_tbl:
        verifications = filter(lambda v: v['user'] == u['_key'], verifications_tbl)
        verifications = [v['name'] for v in verifications]
        seedConnected = 'SeedConnected' in verifications
        if not seedConnected:
            continue
        if 'BrightID' not in verifications:
            db['verifications'].insert({
                'name': 'BrightID',
                'user': u['_key'],
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: BrightID'.format(u['_key']))
    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
