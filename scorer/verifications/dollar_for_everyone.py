import time
from arango import ArangoClient


def verify():
    print('DOLLAR FOR EVERYONE')
    db = ArangoClient().db('_system')
    for admin in db['users'].find({'dfeAdmin': True}):
        conns1 = [c['_to'] for c in db['connections'].find({'_from': admin['_id']}) if c['timestamp'] > 1564600000000]
        conns2 = [c['_from'] for c in db['connections'].find({'_to': admin['_id']}) if c['timestamp'] > 1564600000000]
        for u in conns1 + conns2:
            verifications = set([v['name'] for v in db['verifications'].find({'user': u})])
            if 'DollarForEveryone' not in verifications:
                db['verifications'].insert({
                    'name': 'DollarForEveryone',
                    'user': u,
                    'timestamp': int(time.time() * 1000)
                })
                print('user: {}\tverification: DollarForEveryone'.format(u))
    verifiedCount = db['verifications'].find({'name': 'DollarForEveryone'}).count()
    print('verifieds: {}\n'.format(verifiedCount))


if __name__ == '__main__':
    verify()
