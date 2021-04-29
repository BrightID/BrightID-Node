from arango import ArangoClient
import time
from . import utils
from anti_sybil.utils import *
import anti_sybil.algorithms as algorithms
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def get_verifications(user, block):
    cursor = db.aql.execute('''
        FOR v in verifications
            FILTER v.user == @user
                AND v.block == @block
            RETURN v.name
    ''', bind_vars={'user': user, 'block': block})
    return sorted(cursor.batch())


def custom_graph():
    last_block = db['variables'].get('VERIFICATION_BLOCK')['value']
    seed_groups = {}
    graph = {}
    eligibles = set()
    edges = set()
    for seed_group in snapshot_db['groups'].find({'seed': True}):
        c = snapshot_db['usersInGroups'].find({'_to': seed_group['_id']})
        seeds = [s['_from'] for s in c]
        seed_groups[seed_group['_key']] = len(seeds)
        eligibles.update(seeds)
    while True:
        cursor = snapshot_db.aql.execute('''
            FOR c in connections
                FILTER c._from IN @eligibles
                    AND c.level == 'recovery'
                RETURN c
        ''', bind_vars={'eligibles': list(eligibles)})
        before = len(eligibles)
        for c in cursor:
            eligibles.add(c['_to'])
            f = c['_from'].replace('users/', '')
            t = c['_to'].replace('users/', '')
            edges.add((f, t))
        after = len(eligibles)
        if before == after:
            break

    nodes = {}
    for u in eligibles:
        u = u.replace('users/', '')
        created_at = next(db['users'].find({'_key': u}))['createdAt']
        nodes[u] = {'node_type': 'Honest', 'init_rank': 0, 'rank': 0, 'name': u, 'groups': {
        }, 'created_at': created_at, 'verifications': get_verifications(u, last_block)}

    for ug in db['usersInGroups']:
        if ug['_from'] not in eligibles:
            continue
        u = ug['_from'].replace('users/', '')
        g = ug['_to'].replace('groups/', '')
        nodes[u]['groups'][g] = 'NonSeed'
        if g in seed_groups:
            nodes[u]['groups'][g] = 'Seed'
            nodes[u]['node_type'] = 'Seed'
            nodes[u]['init_rank'] += 1 / seed_groups[g]
    for n in nodes:
        nodes[n]['init_rank'] = min(.3, nodes[n]['init_rank'])
    graph['edges'] = list(edges)
    graph['nodes'] = nodes.values()
    graph['nodes'] = sorted(graph['nodes'], key=lambda n: n['name'])
    graph['nodes'] = sorted(
        graph['nodes'], key=lambda i: i['created_at'], reverse=True)
    return json.dumps(graph)


def verify(block):
    print('RECOVERY LEVEL 2')

    json_graph = custom_graph()
    graph = from_json(json_graph, True)
    ranker = algorithms.SybilRank(graph, {'directed': True})
    ranker.rank()
    graph = linear_distribution(ranker.graph)

    for node in graph:
        db['verifications'].insert({
            'name': 'RecoveryLevel2',
            'user': node.name,
            'rank': node.rank,
            'raw_rank': node.raw_rank,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('RecoveryLevel2', node.name, node.rank)
        })
    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'RecoveryLevel2'
                AND v.rank > 0
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print(f'verifications: {verifiedCount}\n')
