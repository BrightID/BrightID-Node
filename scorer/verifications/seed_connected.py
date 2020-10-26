from arango import ArangoClient
import time

SEED_CONNECTION_LEVELS = ['just met', 'already know', 'recovery']
DEFAULT_QUOTA = 50


def verify(fname):
    print('SEED CONNECTED')
    db = ArangoClient().db('_system')
    seed_groups = list(db['groups'].find({'seed': True}))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seed_groups_members = {}
    all_seeds = set()
    seed_group_quota = {}
    for seed_group in seed_groups:
        userInGroups = list(db['usersInGroups'].find({'_to': seed_group['_id']}))
        userInGroups.sort(key=lambda ug: ug['timestamp'])
        seeds = [ug['_from'] for ug in userInGroups]
        all_seeds.update(seeds)
        seed_groups_members[seed_group['_id']] = seeds
        seed_group_quota[seed_group['_id']] = seed_group.get('quota', DEFAULT_QUOTA)

    for seed_group in seed_groups_members:
        members = seed_groups_members[seed_group]
        used = db['verifications'].find(
            {'name': 'SeedConnected', 'seedGroup': seed_group}).count()
        unused = seed_group_quota[seed_group] - used
        if unused < 1:
            continue
        conns = db.aql.execute(
            '''FOR d IN connections
                SORT d.timestamp
                FILTER d._from IN @members
                    AND d.level IN @levels
                RETURN d''',
            bind_vars={'members': list(members), 'levels': SEED_CONNECTION_LEVELS}
        )
        seed_neighbors = []
        for conn in conns:
            if conn['_from'] not in seed_neighbors:
                seed_neighbors.append(conn['_from'])

            c1 = conn['_to'] not in seed_neighbors
            # filter neighbors that are seeds but are not member of this seed group
            # to allow each seed group maximize the number of non-seeds that verify
            # and postpone the verification of those filtered seeds to their seed groups
            c2 = conn['_to'] not in all_seeds
            if c1 and c2:
                seed_neighbors.append(conn['_to'])

        for neighbor in seed_neighbors:
            neighbor = neighbor.replace('users/', '')
            verifications = set(
                [v['name'] for v in db['verifications'].find({'user': neighbor})])
            if 'SeedConnected' not in verifications:
                db['verifications'].insert({
                    'name': 'SeedConnected',
                    'user': neighbor,
                    'seedGroup': seed_group,
                    'timestamp': int(time.time() * 1000)
                })
                print('user: {}\tverification: SeedConnected'.format(neighbor))
                unused -= 1
                if unused < 1:
                    break
    verifiedCount = db['verifications'].find({'name': 'SeedConnected'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
