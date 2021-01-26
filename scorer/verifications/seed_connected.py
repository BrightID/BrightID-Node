from arango import ArangoClient
import time
from . import utils
import config

PENALTY = 3

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def seed_connections(group_id, after):
    cursor = snapshot_db['usersInGroups'].find({'_to': group_id})
    members = [ug['_from'] for ug in cursor]
    return snapshot_db.aql.execute('''
        FOR c in connections
            FILTER c.timestamp > @after
                AND c._from IN @members
            SORT c.timestamp, c._from, c._to ASC
            RETURN c
    ''', bind_vars={'after': after, 'members': members})


def last_verifications():
    last_block = db['variables'].get('VERIFICATION_BLOCK')['value']
    cursor = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'SeedConnected'
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': last_block})
    verifications = {v['user']: v for v in cursor}
    # update old SeedConnected verifications
    # this block can be removed after all nodes updated
    for v in verifications.values():
        if 'seedGroup' in v:
            v['connected'] = [v['seedGroup'].replace('groups/', '')]
            v['reported'] = []
            del v['seedGroup']
    return verifications


def verify(block):
    print('SEED CONNECTED')
    users = last_verifications()

    # find number of users each seed group verified
    counts = {}
    for u, v in users.items():
        for g in v['connected']:
            counts[g] = counts.get(g, 0) + 1

    last_block_time = snapshot_db['variables'].get('LAST_BLOCK_TIME')['value']
    seed_groups = list(snapshot_db['groups'].find({'seed': True}))
    for seed_group in seed_groups:
        # load connection that members of this se
        connections = seed_connections(seed_group['_id'], last_block_time * 1000)
        quota = seed_group.get('quota', 0)
        counter = counts.get(seed_group['_key'], 0)
        for c in connections:
            u = c['_to'].replace('users/', '')
            if u not in users:
                users[u] = {'connected': [], 'reported': []}

            if c['level'] in ['just met', 'already known', 'recovery']:
                already_connected = seed_group['_key'] in users[u]['connected']
                if not already_connected:
                    counter += 1
                    if counter <= quota:
                        users[u]['connected'].append(seed_group['_key'])
            elif c['level'] == 'reported':
                already_reported = seed_group['_key'] in users[u]['reported']
                users[u]['reported'].append(seed_group['_key'])

        spent = min(counter, quota)
        exceeded = max(counter - quota, 0)
        region = seed_group.get('region')
        print(f'{region}, quota: {quota}, spent: {spent}, exceeded: {exceeded}')

    for u, d in users.items():
        # penalizing users that are reported by seeds
        rank = len(d['connected']) - len(d['reported'])*PENALTY
        db['verifications'].insert({
            'name': 'SeedConnected',
            'user': u,
            'rank': rank,
            'connected': d['connected'],
            'reported': d['reported'],
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
