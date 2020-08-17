import time
from arango import ArangoClient


def verify():
    print('BrightID')
    db = ArangoClient().db('_system')
    for u in db['users']:
        verifications = set([v['name'] for v in db['verifications'].find({'user': u['_id']})])
        callJoined = 'CallJoined' in verifications
        seedConnected = 'SeedConnected' in verifications
        if not (u['score'] >= 3 or (callJoined and seedConnected)):
            continue
        if 'BrightID' not in verifications:
            db['verifications'].insert({
                'name': 'BrightID',
                'user': u['_id'],
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: BrightID'.format(u['_key']))
    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))


if __name__ == '__main__':
    verify()
