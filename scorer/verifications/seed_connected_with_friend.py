from arango import ArangoClient
import itertools
import time
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
NODE_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
verifications = {}


def addVerificationTo(user, friend):
    if 'SeedConnectedWithFriend' in verifications[user]:
        return
    verifications[user]['SeedConnectedWithFriend'] = {
        'name': 'SeedConnectedWithFriend',
        'user': user,
        'friend': friend,
        'timestamp': int(time.time() * 1000)
    }
    db['verifications'].insert(verifications[user]['SeedConnectedWithFriend'])


def getVerifications(user):
    return {v['name']: v for v in snapshot_db['verifications'].find({'user': user})}


def verify(fname):
    print('SEED CONNECTED WITH FRIEND')
    time_limit = (int(time.time()) * 1000) - GO_BACK_TIME
    seed_groups = list(snapshot_db['groups'].find({'seed': True}))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seeds = []
    for seed_group in seed_groups:
        userInGroups = list(snapshot_db['usersInGroups'].find(
            {'_to': seed_group['_id']}))
        userInGroups.sort(key=lambda ug: ug['timestamp'])
        for ug in userInGroups:
            seed = ug['_from'].replace('users/', '')
            if seed not in seeds:
                seeds.append(seed)

    for seed in seeds:
        verifications[seed] = getVerifications(seed)
        # seeds get this verification if they have SeedConnected (had quota for themselves)
        if verifications[seed].get('SeedConnected', {}).get('rank', 0) > 0:
            addVerificationTo(seed, None)

        conns = snapshot_db.aql.execute('''
            FOR c IN connections
                SORT c.timestamp
                FILTER c._from == @seed
                    AND c.level IN @levels
                    AND c.timestamp > @time_limit
                    RETURN c
        ''', bind_vars={
            'seed': 'users/' + seed,
            'levels': SEED_CONNECTION_LEVELS,
            'time_limit': time_limit
        }).batch()
        seedConnTimes = {}
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor in seeds:
                continue
            if neighbor not in verifications:
                verifications[neighbor] = getVerifications(neighbor)

            if verifications[neighbor].get('SeedConnected', {}).get('rank', 0) < 1:
                continue

            seedConnTimes[neighbor] = conn['timestamp']

        pairs = itertools.combinations(seedConnTimes.keys(), 2)
        for pair in pairs:
            p0verified = 'SeedConnectedWithFriend' in verifications[pair[0]]
            p1verified = 'SeedConnectedWithFriend' in verifications[pair[1]]
            if p0verified and p1verified:
                continue

            gap = abs(seedConnTimes[pair[0]] - seedConnTimes[pair[1]])
            if gap > CONN_DIFF_TIME:
                continue

            ft = snapshot_db['connections'].find(
                {'_from': 'users/' + pair[0], '_to': 'users/' + pair[1]})
            if ft.empty() or ft.next()['level'] not in NODE_CONNECTION_LEVELS:
                continue

            tf = snapshot_db['connections'].find(
                {'_from': 'users/' + pair[1], '_to': 'users/' + pair[0]})
            if tf.empty() or tf.next()['level'] not in NODE_CONNECTION_LEVELS:
                continue

            addVerificationTo(pair[0], pair[1])
            addVerificationTo(pair[1], pair[0])

    # if a user doesn't have the SeedConnected verification anymore,
    # the SeedConnectedWithFriend will revoke.
    s1 = set(v['user'] for v in snapshot_db['verifications'].find(
        {'name': 'SeedConnectedWithFriend'}))
    s2 = set(v['user'] for v in snapshot_db['verifications'].find(
        {'name': 'SeedConnected'}))
    for user in (s1 - s2):
        db['verifications'].delete_match({
            'name': 'SeedConnectedWithFriend',
            'user': user
        })

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend'}).count()
    print(f'verifieds: {verifiedCount}\n')
