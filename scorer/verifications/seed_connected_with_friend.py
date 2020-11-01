from arango import ArangoClient
import itertools
import time
import utils

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
NODE_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient().db('_system')
verifications = {}


def addVerificationTo(user, friend):
    if 'SeedConnectedWithFriend' in verifications[user]:
        return
    db['verifications'].insert({
        'name': 'SeedConnectedWithFriend',
        'user': user,
        'friend': friend,
        'timestamp': int(time.time() * 1000)
    })
    verifications[user].append('SeedConnectedWithFriend')
    print(f"user: {user}\tverification: SeedConnectedWithFriend")


def getVerifications(user, verifications_tbl):
    verifications = filter(lambda v: v['user'] == user, verifications_tbl)
    return [v['name'] for v in verifications]


def verify(fname):
    print('SEED CONNECTED WITH FRIEND')
    time_limit = (int(time.time()) * 1000) - GO_BACK_TIME
    groups_tbl = utils.zip2dict(fname, 'groups')
    verifications_tbl = utils.zip2dict(fname, 'verifications')
    user_groups_tbl = utils.zip2dict(fname, 'usersInGroups')
    connections_tbl = utils.zip2dict(fname, 'connections')
    seed_groups = list(filter(lambda g: g.get('seed'), groups_tbl))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seeds = []
    for seed_group in seed_groups:
        userInGroups = list(
            filter(lambda ug: ug['_to'] == seed_group['_id'], user_groups_tbl))
        userInGroups.sort(key=lambda ug: ug['timestamp'])
        for ug in userInGroups:
            seed = ug['_from'].replace('users/', '')
            if seed not in seeds:
                seeds.append(seed)
    for seed in seeds:
        verifications[seed] = getVerifications(seed, verifications_tbl)
        # seeds get this verification if they have SeedConnected (had quota for themselves)
        if 'SeedConnected' in verifications[seed]:
            addVerificationTo(seed, None)

        conns = list(filter(lambda c: c['_from'] == seed and c['level']
                            in SEED_CONNECTION_LEVELS and c['timestamp'] > time_limit, connections_tbl))
        conns.sort(key=lambda c: c['timestamp'])
        seedConnTimes = {}
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor in seeds:
                continue

            verifications[neighbor] = getVerifications(neighbor, verifications_tbl)
            if 'SeedConnected' not in verifications[neighbor]:
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

            ft = list(filter(lambda c: c['_from'] == f"users/{pair[0]}" and c['_to'] == f"users/{pair[1]}", connections_tbl))
            if not ft or ft[0]['level'] not in NODE_CONNECTION_LEVELS:
                continue

            tf = list(filter(lambda c: c['_from'] == f"users/{pair[1]}" and c['_to'] == f"users/{pair[0]}", connections_tbl))
            if not tf or tf[0]['level'] not in NODE_CONNECTION_LEVELS:
                continue

            addVerificationTo(pair[0], pair[1])
            addVerificationTo(pair[1], pair[0])

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend'}).count()
    print(f'verifieds: {verifiedCount}\n')
