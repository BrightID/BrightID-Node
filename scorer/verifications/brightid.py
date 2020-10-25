import time
from arango import ArangoClient


def verify(fname):
    print('BRIGHTID')
    db = ArangoClient().db('_system')
    for u in db['users']:
        verifications = set([v['name'] for v in db['verifications'].find({'user': u['_key']})])
        seedConnected = 'SeedConnected' in verifications
        seedConnectedWithFriend = 'SeedConnectedWithFriend' in verifications
        if not (seedConnected and seedConnectedWithFriend):
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


if __name__ == '__main__':
    verify()
