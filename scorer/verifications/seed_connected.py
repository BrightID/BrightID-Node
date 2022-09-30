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
            FILTER c._from IN @members
                AND (c.timestamp > @after OR c.level == 'reported')
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
    return verifications


def verify(block):
    print('SEED CONNECTED')
    users = last_verifications()

    # find number of users each seed group verified
    counts = {}
    for u, v in users.items():
        v['reported'] = []
        # this if block used to init communities and can be removed in the next release
        if 'communities' not in v:
            v['communities'] = v['connected']
        for g in v['connected']:
            counts[g] = counts.get(g, 0) + 1

    prev_snapshot_time = snapshot_db['variables'].get('PREV_SNAPSHOT_TIME')['value']
    seed_groups = snapshot_db['groups'].find({'seed': True})
    for seed_group in seed_groups:
        # load connection that members of this seed group made after
        # previous snapshot
        connections = seed_connections(
            seed_group['_id'], prev_snapshot_time * 1000)
        quota = seed_group.get('quota', 0)
        counter = counts.get(seed_group['_key'], 0)
        for c in connections:
            u = c['_to'].replace('users/', '')
            if u not in users:
                users[u] = {'connected': [], 'reported': [], 'communities': []}

            if c['level'] in ['just met', 'already known', 'recovery']:
                if seed_group['_key'] not in users[u]['communities']:
                    users[u]['communities'].append(seed_group['_key'])
                if seed_group['_key'] not in users[u]['connected']:
                    counter += 1
                    if counter <= quota:
                        users[u]['connected'].append(seed_group['_key'])
            elif c['level'] == 'reported':
                if seed_group['_key'] not in users[u]['reported']:
                    users[u]['reported'].append(seed_group['_key'])

        spent = min(counter, quota)
        exceeded = max(counter - quota, 0)
        region = seed_group.get('region')
        print(f'{region}, quota: {quota}, spent: {spent}, exceeded: {exceeded}')

    counter = 0
    batch_db = db.begin_batch_execution(return_result=True)
    verifications_col = batch_db.collection('verifications')
    for u, d in users.items():
        # penalizing users that are reported by seeds
        rank = len(d['connected']) - len(d['reported']) * PENALTY
        verifications_col.insert({
            'name': 'SeedConnected',
            'user': u,
            'rank': rank,
            'connected': d['connected'],
            'communities': d['communities'],
            'reported': d['reported'],
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('SeedConnected', u, rank)
        })

        if rank > 0:
            counter += 1

        if counter % 1000 == 0:
            batch_db.commit()
            batch_db = db.begin_batch_execution(return_result=True)
            verifications_col = batch_db.collection('verifications')
    batch_db.commit()

    print(f'verifications: {counter}\n')
