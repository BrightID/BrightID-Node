from arango import ArangoClient
import time
from . import utils
import config

PENALTY = 3
# 08/13/2020 12:00am (UTC)
IGNORE_QUOTA_BEFORE = 1597276800000


db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def seed_connections(group_id):
    cursor = snapshot_db['usersInGroups'].find({'_to': group_id})
    members = [ug['_from'] for ug in cursor]
    connections = []
    for member in members:
        cursor = snapshot_db['connections'].find({'_from': member})
        connections.extend(cursor)
    connections.sort(key=lambda c: (c['initTimestamp'], c['_from'], c['_to']))
    return connections


def verify(block):
    print('SEED CONNECTED')
    users = {}
    seed_groups = list(snapshot_db['groups'].find({'seed': True}))
    for seed_group in seed_groups:
        connections = seed_connections(seed_group['_id'])
        quota = seed_group.get('quota', 0)
        for c in connections:
            u = c['_to'].replace('users/', '')
            if u not in users:
                users[u] = {'connected': set(), 'reported': set()}

            if c['level'] in ['just met', 'already known', 'recovery']:
                users[u]['connected'].add(seed_group['_key'])
                already_connected = seed_group['_key'] in users[u]['connected']
                ignore_quota = c['initTimestamp'] < IGNORE_QUOTA_BEFORE
                if not (already_connected or ignore_quota):
                    quota -= 1
            elif c['level'] == 'reported':
                users[u]['reported'].add(seed_group['_key'])

    for u, d in users.items():
        # penalizing users that are reported by seeds
        rank = len(d['connected']) - len(d['reported'])*PENALTY
        db['verifications'].insert({
            'name': 'SeedConnected',
            'user': u,
            'rank': rank,
            'connected': list(d['connected']),
            'reported': list(d['reported']),
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('SeedConnected', u, rank)
        })

    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'SeedConnected'
                AND v.rank > 0
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print('verifications: {}\n'.format(verifiedCount))
