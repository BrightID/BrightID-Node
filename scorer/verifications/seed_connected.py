from arango import ArangoClient
import time
import utils

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
DEFAULT_QUOTA = 50


def verify(fname):
    print('SEED CONNECTED')
    db = ArangoClient().db('_system')

    groups = utils.documents(fname, 'groups')
    seed_groups = list(filter(lambda g: g.get('seed'), groups))
    seed_groups.sort(key=lambda s: s['timestamp'])
    seed_group_quota = {s['_key']: s.get('quota', DEFAULT_QUOTA) for s in seed_groups}

    user_groups_documents = utils.documents(fname, 'usersInGroups')
    user_groups_documents.sort(key=lambda ug: ug['timestamp'])
    seed_group_members = {}
    seeds = set()
    for d in user_groups_documents:
        group_id = d['_to'].replace('groups/', '')
        if group_id not in seed_group_quota:
            continue
        if group_id not in seed_group_members:
            seed_group_members[group_id] = []
        seed_group_members[group_id].append(d['_from'])
        seeds.add(d['_from'])

    verifications_documents = utils.documents(fname, 'verifications')
    verifications = {}
    used_quota = {}
    for r in verifications_documents:
        if r['name'] == 'SeedConnected':
            used_quota[r['seedGroup']] = used_quota.get(r['seedGroup'], 0) + 1
        if r['user'] not in verifications:
            verifications[r['user']] = []
        verifications[r['user']].append(r['name'])

    connections = utils.documents(fname, 'connections')

    new_verified_users = set()
    for seed_group in seed_group_quota:
        members = seed_group_members[seed_group]
        used = used_quota.get(seed_group, 0)
        unused = seed_group_quota[seed_group] - used
        if unused < 1:
            continue
        conns = list(filter(lambda c: c['_from'] in members and c['level'] in SEED_CONNECTION_LEVELS, connections))
        conns.sort(key=lambda c: c['timestamp'])
        seed_neighbors = []
        for conn in conns:
            # skip duplicate members
            if conn['_from'] not in seed_neighbors:
                seed_neighbors.append(conn['_from'])

            # filter neighbors that are seeds but are not member of this seed group
            # to allow each seed group maximize the number of non-seeds that verify
            # and postpone the verification of those filtered seeds to their seed groups
            if conn['_to'] in seeds:
                continue

            # skip duplicate members
            if conn['_to'] not in seed_neighbors:
                seed_neighbors.append(conn['_to'])

        for neighbor in seed_neighbors:
            neighbor = neighbor.replace('users/', '')
            if neighbor in new_verified_users:
                continue
            if 'SeedConnected' in verifications.get(neighbor, []):
                continue
            db['verifications'].insert({
                'name': 'SeedConnected',
                'user': neighbor,
                'seedGroup': 'groups/' + seed_group,
                'timestamp': int(time.time() * 1000)
            })
            print('user: {}\tverification: SeedConnected'.format(neighbor))
            new_verified_users.add(neighbor)
            unused -= 1
            if unused < 1:
                break
    verifiedCount = db['verifications'].find({'name': 'SeedConnected'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
