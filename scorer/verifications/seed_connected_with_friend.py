from arango import ArangoClient
import itertools
import time
from . import utils
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
NODE_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
verifications = {}


def addVerificationTo(user, friend, block):
    if 'SeedConnectedWithFriend' in verifications[user]:
        return
    db['verifications'].insert({
        'name': 'SeedConnectedWithFriend',
        'user': user,
        'friend': friend,
        'block': block,
        'timestamp': int(time.time() * 1000),
        'hash': utils.hash('SeedConnectedWithFriend', user)
    })
    verifications[user].append('SeedConnectedWithFriend')


def getVerifications(user, block):
    cursor = db['verifications'].find(
        {'user': user, 'name': 'SeedConnected', 'block': block})
    v = [v['name'] for v in cursor if v['rank'] > 0]
    return v


def verify(block):
    print('SEED CONNECTED WITH FRIEND')
    time_limit = (int(time.time()) * 1000) - GO_BACK_TIME

    # check already verified users
    past_block = db['variables'].get('VERIFICATION_BLOCK')['value']
    verifieds = db.aql.execute('''
        FOR v1 IN verifications
            FILTER v1.name == 'SeedConnectedWithFriend'
                AND v1.block == @past_block
            FOR v2 IN verifications
                FILTER v2.name == 'SeedConnected'
                    AND v2.user == v1.user
                    AND v2.block == @current_block
                    AND v2.rank > 0
                return v1
        ''', bind_vars={'past_block': past_block, 'current_block': block})
    for v in verifieds:
        verifications[v['user']] = ['SeedConnected']
        addVerificationTo(v['user'], v['friend'], block)

    # check for new verified users
    seeds = set()
    for seed_group in snapshot_db['groups'].find({'seed': True}):
        userInGroups = snapshot_db['usersInGroups'].find(
            {'_to': seed_group['_id']})
        seeds.update({ug['_from'].replace('users/', '')
                      for ug in userInGroups})
    for seed in seeds:
        verifications[seed] = getVerifications(seed, block)
        # seeds get this verification if they have SeedConnected (had quota for themselves)
        if 'SeedConnected' in verifications[seed]:
            addVerificationTo(seed, None, block)

        conns = snapshot_db.aql.execute('''
            FOR c IN connections
                FILTER c._from == @seed
                    AND c.level IN @levels
                    AND c.timestamp > @time_limit
                    RETURN c
        ''', bind_vars={
            'seed': 'users/' + seed,
            'levels': SEED_CONNECTION_LEVELS,
            'time_limit': time_limit
        })
        seed_conn_times = {}
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor in seeds:
                continue
            if neighbor not in verifications:
                verifications[neighbor] = getVerifications(neighbor, block)
            if 'SeedConnected' not in verifications[neighbor]:
                continue
            seed_conn_times[neighbor] = conn['timestamp']

        pairs = itertools.combinations(seed_conn_times.keys(), 2)
        for pair in pairs:
            p0verified = 'SeedConnectedWithFriend' in verifications[pair[0]]
            p1verified = 'SeedConnectedWithFriend' in verifications[pair[1]]
            if p0verified and p1verified:
                continue

            gap = abs(seed_conn_times[pair[0]] - seed_conn_times[pair[1]])
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

            addVerificationTo(pair[0], pair[1], block)
            addVerificationTo(pair[1], pair[0], block)

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend', 'block': block}).count()
    print(f'verifieds: {verifiedCount}\n')
