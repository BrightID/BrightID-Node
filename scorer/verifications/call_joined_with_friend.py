from arango import ArangoClient
import itertools
import time
from . import utils
import config

STAR_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
FRIEND_CONNECTION_LEVELS = ['already known', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
verifieds = set()


def add_verification_to(user, friend, block):
    if user in verifieds:
        return
    db['verifications'].insert({
        'name': 'CallJoinedWithFriend',
        'user': user,
        'friend': friend,
        'block': block,
        'timestamp': int(time.time() * 1000),
        'hash': utils.hash('CallJoinedWithFriend', user)
    })
    verifieds.add(user)


def get_call_joineds(block):
    cursor = db['verifications'].find(
        {'name': 'CallJoined', 'block': block})
    return set(v['user'] for v in cursor if v.get('rank', 0) > 0)


def verify(block):
    global verifieds

    print('CALL JOINED WITH FRIEND')
    time_border = (int(time.time()) * 1000) - GO_BACK_TIME
    stars = [s['user'] for s in snapshot_db['seeds'].find({'type': 'star'})]
    call_joineds = get_call_joineds(block)

    # verify already verified users if they are still have CallJoined
    for v in db['verifications'].find({'name': 'CallJoinedWithFriend'}):
        if v['user'] in call_joineds:
            add_verification_to(v['user'], v['friend'], block)

    # verify new users
    for star in stars:
        # stars get verified by default
        add_verification_to(star, None, block)
        # find users that star connected to them recently
        conns = snapshot_db.aql.execute('''
            FOR c IN connections
                FILTER c._from == @star
                    AND c.level IN @levels
                    AND c.timestamp > @time_border
                    RETURN c
        ''', bind_vars={
            'star': f'users/{star}',
            'levels': STAR_CONNECTION_LEVELS,
            'time_border': time_border
        })
        # store connection timestamp in a map for all non-stars that have CallJoined verification
        star_conn_times = {}
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor in stars:
                continue
            if neighbor not in call_joineds:
                continue
            star_conn_times[neighbor] = conn['timestamp']

        # iterate over all pairs and check if they are friends
        pairs = itertools.combinations(star_conn_times.keys(), 2)
        for pair in pairs:
            # skip if both sides are verified
            if pair[0] in verifieds and pair[1] in verifieds:
                continue

            # skip if pair sides connected to stars in different calls
            gap = abs(star_conn_times[pair[0]] - star_conn_times[pair[1]])
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
            add_verification_to(pair[0], pair[1], block)
            add_verification_to(pair[1], pair[0], block)

    verified_count = db['verifications'].find(
        {'name': 'CallJoinedWithFriend', 'block': block}).count()
    print(f'verifieds: {verified_count}\n')
