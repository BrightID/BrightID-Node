from arango import ArangoClient
import time
import utils

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
DEFAULT_QUOTA = 50


def verify(fname):
    print('SEED CONNECTED')
    db = ArangoClient().db('_system')
    groups_tbl = utils.zip2dict(fname, 'groups')
    user_groups_tbl = utils.zip2dict(fname, 'usersInGroups')
    verifications_tbl = utils.zip2dict(fname, 'verifications')
    connections_tbl = utils.zip2dict(fname, 'connections')
    seed_groups = list(filter(lambda g: g.get('seed'), groups_tbl))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seed_groups_members = {}
    all_seeds = set()
    seed_group_quota = {}
    for seed_group in seed_groups:
        userInGroups = list(filter(lambda ug: ug['_to'] == seed_group['_id'], user_groups_tbl))
        userInGroups.sort(key=lambda ug: ug['timestamp'])
        seeds = [ug['_from'] for ug in userInGroups]
        all_seeds.update(seeds)
        seed_groups_members[seed_group['_id']] = seeds
        seed_group_quota[seed_group['_id']] = seed_group.get('quota', DEFAULT_QUOTA)

    new_verified_users = set()
    for seed_group in seed_groups_members:
        members = seed_groups_members[seed_group]
        used = len(list(filter(lambda v: v['name'] == 'SeedConnected' and v['seedGroup'] == seed_group, verifications_tbl)))
        unused = seed_group_quota[seed_group] - used
        if unused < 1:
            continue
        conns = list(filter(lambda c: c['_from'] in members and c['level'] in SEED_CONNECTION_LEVELS, connections_tbl))
        conns.sort(key=lambda c: c['timestamp'])
        seed_neighbors = []
        for conn in conns:
            # skip duplicate members
            if conn['_from'] not in seed_neighbors:
                seed_neighbors.append(conn['_from'])

            # filter neighbors that are seeds but are not member of this seed group
            # to allow each seed group maximize the number of non-seeds that verify
            # and postpone the verification of those filtered seeds to their seed groups
            if conn['_to'] in all_seeds:
                continue

            # skip duplicate members
            if conn['_to'] not in seed_neighbors:
                seed_neighbors.append(conn['_to'])

        for neighbor in seed_neighbors:
            neighbor = neighbor.replace('users/', '')
            verifications = filter(lambda v: v['user'] == neighbor, verifications_tbl)
            verifications = [v['name'] for v in verifications]
            if neighbor in new_verified_users:
                continue
            if 'SeedConnected' in verifications:
                continue
            db['verifications'].insert({
                'name': 'SeedConnected',
                'user': neighbor,
                'seedGroup': seed_group,
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: SeedConnected'.format(neighbor))
            new_verified_users.add(neighbor)
            unused -= 1
            if unused < 1:
                break
    verifiedCount = db['verifications'].find({'name': 'SeedConnected'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
