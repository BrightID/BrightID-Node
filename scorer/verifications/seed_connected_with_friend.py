from arango import ArangoClient
import itertools
import operator
import time
from .utils import documents

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
NODE_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient().db('_system')
verifications = {}


def addVerificationTo(user, friend, block):
    global verifications
    if 'SeedConnectedWithFriend' in verifications[user]:
        return
    db['verifications'].insert({
        'name': 'SeedConnectedWithFriend',
        'user': user,
        'friend': friend,
        'timestamp': int(time.time() * 1000),
        'block': block
    })
    verifications[user].append('SeedConnectedWithFriend')


def verify(fname, past_block, current_block):
    global verifications
    print('SEED CONNECTED WITH FRIEND')
    time_limit = (int(time.time()) * 1000) - GO_BACK_TIME
    verifications_docs = documents(fname, 'verifications')
    for d in verifications_docs:
        if d['block'] != past_block or d['name'] != 'SeedConnected':
            continue
        if d['user'] not in verifications:
            verifications[d['user']] = []
        verifications[d['user']].append(d['name'])

    for d in verifications_docs:
        if d['block'] != past_block or d['name'] != 'SeedConnectedWithFriend':
            continue
        if 'SeedConnected' not in verifications[d['name']]:
            continue
        if 'SeedConnected' not in verifications[d['friend']]:
            continue
        addVerificationTo(d['name'], d['friend'], current_block)

    groups_docs = documents(fname, 'groups')
    seed_groups = [g['_id'] for g in groups_docs if g.get('seed')]

    user_groups_docs = documents(fname, 'usersInGroups')
    seeds = set([d['_from'].replace('users/', '')
                 for d in user_groups_docs if d['_to'] in seed_groups])

    connections_docs = documents(fname, 'connections')
    connections = {}
    for d in connections_docs:
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
            addVerificationTo(seed, None, current_block)
        conns = connections.get(seed, {})
        conns = sorted(conns.items(), key=operator.itemgetter(1))
        seed_conn_times = {}
        for conn in conns:
            if conn[1] <= time_limit:
                continue

            neighbor = conn[0].replace('users/', '')
            if neighbor in seeds:
                continue

            if 'SeedConnected' not in verifications.get(neighbor, []):
                continue

            seed_conn_times[neighbor] = conn[1]

        pairs = itertools.combinations(seed_conn_times.keys(), 2)
        for pair in pairs:
            p0verified = 'SeedConnectedWithFriend' in verifications.get(
                pair[0], [])
            p1verified = 'SeedConnectedWithFriend' in verifications.get(
                pair[1], [])
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

            addVerificationTo(pair[0], pair[1], current_block)
            addVerificationTo(pair[1], pair[0], current_block)

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend', 'block': current_block}).count()
    print(f'verifieds: {verifiedCount}\n')
