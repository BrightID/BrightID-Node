from arango import ArangoClient
import time
from . import utils
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
DEFAULT_QUOTA = 9999
PENALTY = 3


def verify(block):
    print('SEED CONNECTED')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')

    seed_groups_members = {}
    seed_groups_quota = {}
    seed_conns = {}
    seed_groups = list(snapshot_db['groups'].find({'seed': True}))
    seed_groups.sort(key=lambda s: s['timestamp'])
    for seed_group in seed_groups:
        userInGroups = list(snapshot_db['usersInGroups'].find(
            {'_to': seed_group['_id']}))
        userInGroups.sort(key=lambda ug: ug['timestamp'])
        seeds = [ug['_from'] for ug in userInGroups]
        seed_groups_members[seed_group['_key']] = seeds
        seed_groups_quota[seed_group['_key']] = seed_group.get(
            'quota', DEFAULT_QUOTA)
        for seed in seeds:
            if seed in seed_conns:
                continue
            seed_conns[seed] = list(
                snapshot_db['connections'].find({'_from': seed}))
    verifieds = {}
    for seed_group in seed_groups_members:
        members = seed_groups_members[seed_group]
        unused = seed_groups_quota[seed_group]
        conns = []
        for member in members:
            conns.extend(seed_conns[member])
        conns.sort(key=lambda c: c['timestamp'])
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor not in verifieds:
                verifieds[neighbor] = {
                    'rank': 0, 'seeds': [], 'seed_groups': [], 'reporters': []}

            # if a user reported by a Seed, it's rank will decrease
            if conn['level'] not in SEED_CONNECTION_LEVELS:
                reporter = conn['_from'].replace('users/', '')
                if reporter not in verifieds[neighbor]['reporters']:
                    verifieds[neighbor]['rank'] -= PENALTY
                    verifieds[neighbor]['reporters'].append(reporter)
                continue

            if seed_group in verifieds[neighbor]['seed_groups']:
                continue

            seed = conn['_from'].replace('users/', '')
            if seed in verifieds[neighbor]['seeds']:
                continue

            if unused < 1:
                continue

            verifieds[neighbor]['seed_groups'].append(seed_group)
            verifieds[neighbor]['seeds'].append(seed)
            verifieds[neighbor]['rank'] += 1
            unused -= 1

        # if quota doesn't set yet
        # set the number of users connected to this group as quota
        # we can remove this in the next release
        if seed_groups_quota[seed_group] == DEFAULT_QUOTA:
            db['groups'].update({
                '_key': seed_group,
                'quota': DEFAULT_QUOTA - unused
            })

    for verified in verifieds:
        db['verifications'].insert({
            'name': 'SeedConnected',
            'user': verified,
            'rank': verifieds[verified]['rank'],
            'seeds': verifieds[verified]['seeds'],
            'seedGroups': verifieds[verified]['seed_groups'],
            'reporters': verifieds[verified]['reporters'],
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('SeedConnected', verified, verifieds[verified]['rank'])
        })

    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'SeedConnected'
                AND v.rank > 0
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print('verifieds: {}\n'.format(verifiedCount))
