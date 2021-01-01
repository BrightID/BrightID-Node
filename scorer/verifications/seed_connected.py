from arango import ArangoClient
import time

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
DEFAULT_QUOTA = 50
PENALTY = 2


def verify(fname):
    print('SEED CONNECTED')
    db = ArangoClient().db('_system')
    snapshot_db = ArangoClient().db('snapshot')

    already_verifieds = set(
        v['user'] for v in snapshot_db['verifications'].find({'name': 'SeedConnected'}))
    seed_groups = list(snapshot_db['groups'].find({'seed': True}))
    seed_groups_members = {}
    seed_groups_quota = {}
    seed_conns = {}
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
    for seed_group in seed_groups_quota:
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
                    'score': 0, 'seeds': [], 'seed_groups': [], 'reporters': []}

            # if a user reported by a Seed, it's score will decrease
            if conn['level'] not in SEED_CONNECTION_LEVELS:
                reporter = conn['_from'].replace('users/', '')
                if reporter not in verifieds[neighbor]['reporters']:
                    verifieds[neighbor]['score'] -= PENALTY
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
            verifieds[neighbor]['score'] += 1
            unused -= 1

    for verified in verifieds:
        if not verifieds[verified]['seeds'] and not verifieds[verified]['reporters']:
            continue
        already_verifieds.discard(verified)
        db.aql.execute('''
            UPSERT {
                user: @user,
                name: 'SeedConnected'
            }
            INSERT {
                name: 'SeedConnected',
                user: @user,
                score: @score,
                seeds: @seeds,
                seedGroups: @seed_groups,
                reporters: @reporters,
                timestamp: @timestamp
            }
            UPDATE {
                score: @score,
                seeds: @seeds,
                seedGroups: @seed_groups,
                reporters: @reporters,
                timestamp: @timestamp
            }
            IN verifications
        ''', bind_vars={
            'user': verified,
            'score': verifieds[verified]['score'],
            'seeds': verifieds[verified]['seeds'],
            'seed_groups': verifieds[verified]['seed_groups'],
            'reporters': verifieds[verified]['reporters'],
            'timestamp': int(time.time() * 1000)
        })

    # if a user is not connected to a seed (with enough quota) anymore,
    # the SeedConnected will revoke.
    for already_verified in already_verifieds:
        db['verifications'].delete_match({
            'name': 'SeedConnected',
            'user': already_verified
        })

    verifiedCount = db['verifications'].find({'name': 'SeedConnected'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
