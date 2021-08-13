from arango import ArangoClient
import time
from . import utils
import config

PENALTY = 3
EXTRA_QUOTA = 100

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def star_connections(star, after):
    return snapshot_db.aql.execute('''
        FOR c in connections
            FILTER c._from == @star
                AND (c.timestamp > @after OR c.level == 'reported')
            SORT c.timestamp, c._from, c._to ASC
            RETURN c
    ''', bind_vars={'after': after, 'star': f'users/{star}'}).batch()


def last_verifications():
    last_block = db['variables'].get('VERIFICATION_BLOCK')['value']
    cursor = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'CallJoined'
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': last_block})
    verifications = {v['user']: v for v in cursor}
    return verifications


def verify(block):
    print('CALL JOINED')
    users = last_verifications()

    # find number of users each star verified
    counts = {}
    for u, v in users.items():
        v['reported'] = []
        for g in v['connected']:
            counts[g] = counts.get(g, 0) + 1

    prev_snapshot_time = snapshot_db['variables'].get('PREV_SNAPSHOT_TIME')[
        'value']
    stars = snapshot_db['seeds'].find({'type': 'star'})
    for star in stars:
        quota = star.get('quota', 0)
        # at the first run calculate the stars quota
        if quota == 0:
            connections = star_connections(star['user'], 0)
            quota = len([c for c in connections if c['level'] in [
                        'just met', 'already known', 'recovery']]) + EXTRA_QUOTA
            db['seeds'].update({'_key': star['_key'], 'quota': quota})
        else:
            # load connection that stars made after previous snapshot
            connections = star_connections(star, prev_snapshot_time * 1000)

        counter = counts.get(star['user'], 0)
        for c in connections:
            u = c['_to'].replace('users/', '')
            if u not in users:
                users[u] = {'connected': [], 'reported': []}

            if c['level'] in ['just met', 'already known', 'recovery']:
                if star['user'] not in users[u]['connected']:
                    counter += 1
                    if counter <= quota:
                        users[u]['connected'].append(star['user'])
            elif c['level'] == 'reported':
                if star['user'] not in users[u]['reported']:
                    users[u]['reported'].append(star['user'])

        spent = min(counter, quota)
        exceeded = max(counter - quota, 0)
        print(
            f"{star['user']}, quota: {quota}, spent: {spent}, exceeded: {exceeded}")

    for u, d in users.items():
        # penalizing users that are reported by seeds
        rank = len(d['connected']) - len(d['reported']) * PENALTY
        db['verifications'].insert({
            'name': 'CallJoined',
            'user': u,
            'rank': rank,
            'connected': d['connected'],
            'reported': d['reported'],
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('CallJoined', u, rank)
        })

    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'CallJoined'
                AND v.rank > 0
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print(f'verifications: {verifiedCount}\n')
