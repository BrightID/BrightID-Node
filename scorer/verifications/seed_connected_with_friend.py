from arango import ArangoClient
import itertools
import time

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
NODE_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient().db('_system')


def verify(fname):
    print('SEED CONNECTED WITH FRIEND')
    time_limit = (int(time.time()) * 1000) - GO_BACK_TIME
    seed_groups = list(db['groups'].find({'seed': True}))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seeds = []
    for seed_group in seed_groups:
        userInGroups = db['usersInGroups'].find({'_to': seed_group['_id']})
        userInGroups = list(db['usersInGroups'].find({'_to': seed_group['_id']}))
        userInGroups.sort(key=lambda ug: ug['timestamp'])
        for ug in userInGroups:
            if ug in seeds:
                continue
            seeds.append(ug['_from'])

    for seed in seeds:
        verifications = {}
        verifications[seed] = get_verifications(seed)
        seed_connected_with_friend = 'SeedConnectedWithFriend' in verifications[seed]
        seed_connected = 'SeedConnected' in verifications[seed]
        if not seed_connected_with_friend and seed_connected:
            db['verifications'].insert({
                'name': 'SeedConnectedWithFriend',
                'user': seed.replace('users/', ''),
                'timestamp': int(time.time() * 1000)
            })
            print(f"user: {seed}\tverification: SeedConnectedWithFriend")

        conns = db.aql.execute('''
            FOR c IN connections
                SORT c.timestamp
                FILTER c._from == @seed
                    AND c.level IN @levels
                    AND c.timestamp > @time_limit
                    RETURN c
        ''', bind_vars={'seed': seed, 'levels': SEED_CONNECTION_LEVELS, 'time_limit': time_limit}
        )
        neighbors = {}
        for conn in conns:
            if conn['_to'] in seeds:
                continue

            verifications[conn['_to']] = get_verifications(conn['_to'])
            if 'SeedConnected' not in verifications[conn['_to']]:
                continue

            neighbors[conn['_to']] = conn['timestamp']

        pairs = itertools.combinations(neighbors.keys(), 2)
        for pair in pairs:
            p0_with_friend = 'SeedConnectedWithFriend' in verifications[pair[0]]
            p1_with_friend = 'SeedConnectedWithFriend' in verifications[pair[1]]
            if p0_with_friend and p1_with_friend:
                continue

            t = abs(neighbors[pair[0]] - neighbors[pair[1]])
            if t > CONN_DIFF_TIME:
                continue

            ft = db['connections'].find({'_from': pair[0], '_to': pair[1]})
            if ft.empty() or ft.batch()[0]['level'] not in NODE_CONNECTION_LEVELS:
                continue

            tf = db['connections'].find({'_from': pair[1], '_to': pair[0]})
            if tf.empty() or tf.batch()[0]['level'] not in NODE_CONNECTION_LEVELS:
                continue

            if 'SeedConnectedWithFriend' not in verifications[pair[0]]:
                db['verifications'].insert({
                    'name': 'SeedConnectedWithFriend',
                    'user': pair[0].replace('users/', ''),
                    'timestamp': int(time.time() * 1000)
                })
                print(f"user: {pair[0]}\tverification: SeedConnectedWithFriend")

            if 'SeedConnectedWithFriend' not in verifications[pair[1]]:
                db['verifications'].insert({
                    'name': 'SeedConnectedWithFriend',
                    'user': pair[1].replace('users/', ''),
                    'timestamp': int(time.time() * 1000)
                })
                print(f"user: {pair[1]}\tverification: SeedConnectedWithFriend")

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend'}).count()
    print(f'verifieds: {verifiedCount}\n')


def get_verifications(user):
    user = user.replace('users/', '')
    return [v['name'] for v in db['verifications'].find({'user': user})]
