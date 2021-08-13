from arango import ArangoClient
import time
from . import utils
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def get_communities():
    return snapshot_db.aql.execute('''
        FOR seed in seeds
            FILTER seed.type == 'community'
            RETURN DISTINCT seed.community
    ''')


def get_seeds_quota(community):
    seeds = snapshot_db.aql.execute('''
        FOR seed in seeds
            FILTER seed.type == 'community'
                AND seed.community == @community
            RETURN seed
    ''', bind_vars={'community': community})
    return {s['user']: s['quota'] for s in seeds}


def get_seeds_conns(seeds):
    seeds_conns = snapshot_db.aql.execute('''
        FOR c in connections
            FILTER c._from IN @seeds
                AND c.level IN ['already known', 'recovery']
            SORT c.timestamp, c._from, c._to ASC
            RETURN c
    ''', bind_vars={'seeds': seeds})
    return [c for c in seeds_conns]


def count_intra_community_conns(member, members):
    return snapshot_db.aql.execute('''
        FOR c in connections
            FILTER c._from IN @members
                AND c._to == @member
                AND c.level IN ['already known', 'recovery']
            RETURN c
    ''', bind_vars={'member': member, 'members': members}, count=True).count()


def verify(block):
    print('COMMUNITY MEMBERSHIP')
    results = []

    communities = get_communities()
    for community in communities:
        members = {}
        seeds_quota = get_seeds_quota(community)
        quota = sum(seeds_quota.values())
        seeds_conns = get_seeds_conns([f'users/{s}' for s in seeds_quota])
        eligibles = {c['_to']: 0 for c in seeds_conns}
        for e in eligibles:
            eligibles[e] = count_intra_community_conns(
                e, list(eligibles.keys()))
        eligibles = dict(
            sorted(eligibles.items(), key=lambda item: item[1], reverse=True))
        exceeded = 0
        for user in eligibles:
            connected_seeds = [c['_from'].replace(
                'users/', '') for c in seeds_conns if c['_to'] == user]
            for seed in connected_seeds:
                if seeds_quota[seed] > 0:
                    seeds_quota[seed] -= 1
                    members[user] = {'rank': eligibles[user], 'seed': seed}
                    break
            if user not in members:
                exceeded += 1

        results.append({'community': community, 'members': members})
        print(f'{community}, quota: {quota}, spent: {len(members)}, exceeded: {exceeded}')

    biggest_community_size = max([len(c['members']) for c in results])
    for res in results:
        for u in res['members']:
            rank = res['members'][u]['rank'] * \
                len(res['members']) / biggest_community_size
            db['verifications'].insert({
                'name': 'CommunityMembership',
                'community': res['community'],
                'user': u,
                'rank': rank,
                'seed': res['members'][u]['seed'],
                'block': block,
                'timestamp': int(time.time() * 1000),
                'hash': utils.hash('CommunityMembership', u, rank)
            })

    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'CommunityMembership'
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print(f'verifications: {verifiedCount}\n')
