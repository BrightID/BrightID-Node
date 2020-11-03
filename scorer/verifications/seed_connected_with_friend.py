from arango import ArangoClient
import itertools
import operator
import time
import utils

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
NODE_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient().db('_system')
verifications = {}


def addVerificationTo(user, friend):
    global verifications
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


def verify(fname):
    global verifications
    print('SEED CONNECTED WITH FRIEND')
    time_limit = (int(time.time()) * 1000) - GO_BACK_TIME

    verifications_documents = utils.documents(fname, 'verifications')
    for d in verifications_documents:
        if d['user'] not in verifications:
            verifications[d['user']] = []
        verifications[d['user']].append(d['name'])

    groups = utils.documents(fname, 'groups')
    seed_groups = list(filter(lambda g: g.get('seed'), groups))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seed_groups = [s['_key'] for s in seed_groups]
    user_groups_documents = utils.documents(fname, 'usersInGroups')
    user_groups_documents.sort(key=lambda ug: ug['timestamp'])
    seeds = set()
    for d in user_groups_documents:
        group_id = d['_to'].replace('groups/', '')
        if group_id not in seed_groups:
            continue
        seeds.add(d['_from'].replace('users/', ''))

    connections_documents = utils.documents(fname, 'connections')
    connections = {}
    for d in connections_documents:
        if d['timestamp'] <= time_limit:
            continue
        f = d['_from'].replace('users/', '')
        t = d['_to'].replace('users/', '')
        if 'SeedConnected' not in verifications.get(f, []):
            continue
        if 'SeedConnected' not in verifications.get(t, []):
            continue
        levels = SEED_CONNECTION_LEVELS if f in seeds else NODE_CONNECTION_LEVELS
        if d['level'] not in levels:
            continue
        if f not in connections:
            connections[f] = {}
        connections[f][t] = d['timestamp']

    for seed in seeds:
        # seeds get this verification if they have SeedConnected (had quota for themselves)
        if 'SeedConnected' in verifications.get(seed, []):
            addVerificationTo(seed, None)
        conns = connections.get(seed, {})
        conns = sorted(conns.items(), key=operator.itemgetter(1))
        seed_conn_times = {}
        for conn in conns:
            neighbor = conn[0].replace('users/', '')
            if neighbor in seeds:
                continue

            if 'SeedConnected' not in verifications.get(neighbor, []):
                continue

            seed_conn_times[neighbor] = conn[1]

        pairs = itertools.combinations(seed_conn_times.keys(), 2)
        for pair in pairs:
            p0verified = 'SeedConnectedWithFriend' in verifications.get(pair[0], [])
            p1verified = 'SeedConnectedWithFriend' in verifications.get(pair[1], [])
            if p0verified and p1verified:
                continue

            gap = abs(seed_conn_times[pair[0]] - seed_conn_times[pair[1]])
            if gap > CONN_DIFF_TIME:
                continue

            ft = connections.get(pair[0], {}).get(pair[1], {})
            if not ft:
                continue

            tf = connections.get(pair[1], {}).get(pair[0], {})
            if not tf:
                continue

            addVerificationTo(pair[0], pair[1])
            addVerificationTo(pair[1], pair[0])

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend'}).count()
    print(f'verifieds: {verifiedCount}\n')
