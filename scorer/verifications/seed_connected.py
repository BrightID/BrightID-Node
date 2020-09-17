from arango import ArangoClient
import time

MONTHLY_QUOTA = 10
INITIAL_QUOTA = 50


def verify(graph):
    print('SEED CONNECTED')
    db = ArangoClient().db('_system')
    seed_groups = list(db['groups'].find({'seed': True}))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seed_groups_members = {}
    all_seeds = set()
    for seed_group in seed_groups:
        userInGroups = db['usersInGroups'].find({'_to': seed_group['_id']})
        seeds = set([ug['_from'] for ug in userInGroups])
        all_seeds.update(seeds)
        seed_groups_members[seed_group['_id']] = seeds

    for i, seed_group in enumerate(seed_groups_members):
        duration = int(time.time() - seed_groups[i]['timestamp'] / 1000)
        months = int(duration / (30 * 24 * 60 * 60))
        quota = INITIAL_QUOTA + months * MONTHLY_QUOTA
        members = seed_groups_members[seed_group]
        used = db['verifications'].find(
            {'name': 'SeedConnected', 'seedGroup': seed_group}).count()
        unused = quota - used
        if unused < 1:
            continue
        conns = db.aql.execute(
            '''FOR d IN connections
                SORT d.timestamp
                FILTER d._from IN @members
                    OR d._to IN @members
                RETURN d''',
            bind_vars={'members': list(members)}
        )

        seed_neighbors = set()
        for conn in conns:
            seed_neighbors.update([conn['_from'], conn['_to']])
        # filter neighbors that are seeds but are not member of this seed group
        # to allow each seed group maximize the number of non-seeds that verify
        # and postpone the verification of those filtered seeds to their seed groups
        seed_neighbors = [
            m for m in seed_neighbors if m not in all_seeds or m in members]

        for neighbor in seed_neighbors:
            verifications = set([v['name'] for v in db['verifications'].find({'user': neighbor})])
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
