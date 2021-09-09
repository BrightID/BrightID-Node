import time
from arango import ArangoClient
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *
from . import utils
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def get_communities():
    return snapshot_db.aql.execute('''
        FOR seed in seeds
            FILTER seed.type == 'community'
            RETURN DISTINCT seed.group
    ''')


def get_seeds_quota(group):
    seeds = snapshot_db.aql.execute('''
        FOR seed in seeds
            FILTER seed.type == 'community'
                AND seed.group == @group
            RETURN seed
    ''', bind_vars={'group': group})
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


def get_json_graph(eligibles, seeds):
    ret = {'nodes': [], 'edges': []}
    users = snapshot_db.aql.execute('''
        FOR u in users
            FILTER u._id IN @eligibles
            RETURN u
    ''', bind_vars={'eligibles': eligibles})
    for u in users:
        ret['nodes'].append({
            'node_type': 'Seed' if u['_key'] in seeds else 'Honest',
            'init_rank': 1 / len(seeds) if u['_key'] in seeds else 0,
            'rank': 0,
            'name': u['_key'],
            'groups': [],
            'created_at': u['createdAt'],
            'verifications': []
        })

    connections = snapshot_db.aql.execute('''
        FOR c in connections
            FILTER c._from IN @eligibles
                AND c._to IN @eligibles
                AND c.level IN ['already known', 'recovery']
            RETURN c
    ''', bind_vars={'eligibles': eligibles})
    ret['edges'] = [(c['_from'].replace('users/', ''),
                     c['_to'].replace('users/', '')) for c in connections]
    ret['nodes'].sort(key=lambda i: i['name'])
    ret['nodes'].sort(key=lambda i: i['created_at'], reverse=True)
    return json.dumps(ret)


def verify(block):
    print('COMMUNITY MEMBERSHIP LandingProbability')
    results = []

    groups = get_communities()
    for group in groups:
        members = {}
        seeds_quota = get_seeds_quota(group)
        quota = sum(seeds_quota.values())
        seeds_conns = get_seeds_conns([f'users/{s}' for s in seeds_quota])
        eligibles = {c['_to']: 0 for c in seeds_conns}
        json_graph = get_json_graph(
            list(eligibles.keys()), list(seeds_quota.keys()))
        graph = from_json(json_graph, True)
        ranker = algorithms.LandingProbability(graph, {'directed': True})
        ranker.rank()
        for node in ranker.graph:
            eligibles[f'users/{node.name}'] = node.rank
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
        community = db['groups'].get(group).get('region', '')
        results.append(
            {'group': group, 'community': community, 'members': members})
        print(
            f'{community}, quota: {quota}, spent: {len(members)}, exceeded: {exceeded}')

    for res in results:
        for u in res['members']:
            if res['members'][u]['rank'] == 0:
                continue
            db['verifications'].insert({
                'name': 'CommunityMembership2',
                'group': res['group'],
                'community': res['community'],
                'user': u.replace('users/', ''),
                'rank': res['members'][u]['rank'],
                'seed': res['members'][u]['seed'],
                'block': block,
                'timestamp': int(time.time() * 1000),
                'hash': utils.hash('CommunityMembership2', u, res['members'][u]['rank'])
            })

    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'CommunityMembership2'
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print(f'verifications: {verifiedCount}\n')
