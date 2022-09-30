from arango import ArangoClient
import itertools
import time
from . import utils
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
FRIEND_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 6 * 60 * 60 * 1000  # 6 hours

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
verifieds = set()


def add_verification_to(user, friend, block, batch_col):
    if user in verifieds:
        return
    batch_col.insert({
        'name': 'SeedConnectedWithFriend',
        'user': user,
        'friend': friend,
        'block': block,
        'timestamp': int(time.time() * 1000),
        'hash': utils.hash('SeedConnectedWithFriend', user)
    })
    verifieds.add(user)


def get_seeds():
    cursor = snapshot_db.aql.execute('''
        FOR g in groups
            FILTER g.seed == true
            FOR ug in usersInGroups
                FILTER ug._to == g._id
                RETURN DISTINCT ug._from
    ''')
    seeds = set(s.replace('users/', '') for s in cursor)
    return seeds


def get_seed_connecteds(block):
    cursor = db['verifications'].find(
        {'name': 'SeedConnected', 'block': block})
    return set(v['user'] for v in cursor if v.get('rank', 0) > 0)


def verify(block):
    global verifieds

    print('SEED CONNECTED WITH FRIEND')
    verifieds = set()
    time_border = (int(time.time()) * 1000) - GO_BACK_TIME
    seeds = get_seeds()
    seed_connecteds = get_seed_connecteds(block)

    batch_db = db.begin_batch_execution(return_result=True)
    batch_col = batch_db.collection('verifications')

    # verify already verified users if they are still SeedConnected
    for v in db['verifications'].find({'name': 'SeedConnectedWithFriend'}):
        if v['user'] in seed_connecteds:
            add_verification_to(v['user'], v['friend'], block, batch_col)

    # verify new users
    for seed in seeds:
        # seeds get verified by default
        add_verification_to(seed, None, block, batch_col)
        # find users that seed connected to them recently
        conns = snapshot_db.aql.execute('''
            FOR c IN connections
                FILTER c._from == @seed
                    AND c.level IN @levels
                    AND c.timestamp > @time_border
                    RETURN c
        ''', bind_vars={
            'seed': 'users/' + seed,
            'levels': SEED_CONNECTION_LEVELS,
            'time_border': time_border
        })
        # store connection timestamp in a map for all non-seeds that are seed connected
        seed_conn_times = {}
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor in seeds:
                continue
            if neighbor not in seed_connecteds:
                continue
            seed_conn_times[neighbor] = conn['timestamp']

        # iterate over all pairs and check if they are friends
        pairs = itertools.combinations(seed_conn_times.keys(), 2)
        for pair in pairs:
            # skip if both sides are verified
            if pair[0] in verifieds and pair[1] in verifieds:
                continue

            # skip if pair sides connected to seeds in different meets
            gap = abs(seed_conn_times[pair[0]] - seed_conn_times[pair[1]])
            if gap > CONN_DIFF_TIME:
                continue

            # skip if pair sides are not friends
            ft = snapshot_db['connections'].find(
                {'_from': 'users/' + pair[0], '_to': 'users/' + pair[1]})
            if ft.empty() or ft.next()['level'] not in FRIEND_CONNECTION_LEVELS:
                continue

            tf = snapshot_db['connections'].find(
                {'_from': 'users/' + pair[1], '_to': 'users/' + pair[0]})
            if tf.empty() or tf.next()['level'] not in FRIEND_CONNECTION_LEVELS:
                continue

            # verify both sides (if not verified)
            add_verification_to(pair[0], pair[1], block, batch_col)
            add_verification_to(pair[1], pair[0], block, batch_col)
            if len(verifieds) % 1000 == 0:
                batch_db.commit()
                batch_db = db.begin_batch_execution(return_result=True)
                batch_col = batch_db.collection('verifications')
    batch_db.commit()

    print(f'verifieds: {len(verifieds)}\n')
