from arango import ArangoClient
import time
from .utils import documents

db = ArangoClient().db('_system')
SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']
DEFAULT_QUOTA = 50


def addVerificationTo(user, seed, seed_group, block):
    db['verifications'].insert({
        'name': 'SeedConnected',
        'user': user,
        'seedGroup': seed_group,
        'timestamp': int(time.time() * 1000),
        'block': block
    })


def verify(fname, past_block, current_block):
    print('SEED CONNECTED')
    groups_docs = documents(fname, 'groups')
    seed_groups_quota = {}
    for g in groups_docs:
        if not g.get('seed'):
            continue
        seed_groups_quota[g['_key']] = g.get('quota', DEFAULT_QUOTA)

    connections_docs = documents(fname, 'connections')
    user_groups_docs = documents(fname, 'usersInGroups')
    user_groups_docs.sort(key=lambda ug: ug['timestamp'])
    seed_group_members = {}
    seeds = {}
    for d in user_groups_docs:
        group_key = d['_to'].replace('groups/', '')
        if group_key not in seed_groups_quota:
            continue
        if group_key not in seed_group_members:
            seed_group_members[group_key] = []

        seed = d['_from'].replace('users/', '')
        seed_group_members[group_key].append(seed)

        if seed not in seeds:
            seeds[seed] = {}
            conns = filter(lambda c: c['_from'] == d['_from'] and c['level']
                           in SEED_CONNECTION_LEVELS, connections_docs)
            for conn in conns:
                neighbor_key = conn['_to'].replace('users/', '')
                conn['seed'] = seed
                seeds[seed][neighbor_key] = conn

    verifications_docs = documents(fname, 'verifications')
    current_verifieds = set()
    used_quota = {}
    for d in verifications_docs:
        if d['block'] != past_block:
            continue
        if d['name'] == 'SeedConnected':
            if d['user'] not in seeds[d['seed']].keys():
                continue
            addVerificationTo(d['user'], d['seed'],
                              d['seedGroup'], current_block)
            current_verifieds.add(d['user'])
            used_quota[d['seedGroup']] = used_quota.get(d['seedGroup'], 0) + 1

    for seed_group in seed_groups_quota:
        members = seed_group_members[seed_group]
        used = used_quota.get(seed_group, 0)
        unused = seed_groups_quota[seed_group] - used
        if unused < 1:
            continue
        conns = []
        for member in members:
            if member not in current_verifieds:
                addVerificationTo(member, member, seed_group, current_block)
                current_verifieds.add(member)
                unused -= 1
                if unused < 1:
                    break
            conns.extend(seeds[member].values())
        conns.sort(key=lambda c: c['timestamp'])
        for conn in conns:
            neighbor = conn['_to'].replace('users/', '')
            if neighbor in current_verifieds:
                continue

            # filter neighbors that are seeds but are not member of this seed group
            # to allow each seed group maximize the number of non-seeds that verify
            # and postpone the verification of those filtered seeds to their seed groups
            if neighbor in seeds:
                continue

            addVerificationTo(
                neighbor, conn['seed'], seed_group, current_block)
            current_verifieds.add(neighbor)
            unused -= 1
            if unused < 1:
                break
    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnected', 'block': current_block}).count()
    print('verifieds: {}\n'.format(verifiedCount))
