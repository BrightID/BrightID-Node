import time
import utils
from arango import ArangoClient
from anti_sybil.utils import draw_graph
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *


def verify(fname):
    print('YEKTA')
    db = ArangoClient().db('_system')
    verifications_documents = utils.documents(fname, 'verifications')
    verifications = {}
    yekta_history = {}
    for d in verifications_documents:
        if d['name'] == 'Yekta':
            yekta_history[d['user']] = {'rank': d['rank'], 'raw_rank': d['raw_rank']}
        if d['user'] not in verifications:
            verifications[d['user']] = []
        verifications[d['user']].append(d['name'])

    json_graph = from_dump(fname)
    graph = from_json(json_graph)
    nodes_rank = {n.name: {'rank': 0, 'raw_rank': 0} for n in graph}
    ranker = algorithms.Yekta(graph, {})
    ranker.rank()
    for node in ranker.graph:
        nodes_rank[node.name]['rank'] = node.rank
        nodes_rank[node.name]['raw_rank'] = node.raw_rank
    # draw_graph(ranker.graph, 'nodes.html')
    counter = dict.fromkeys(range(0, 6), 0)
    for n in nodes_rank:
        counter[nodes_rank[n]['rank']] += 1
        if nodes_rank[n] == yekta_history.get(n, None):
            continue
        db.aql.execute('''
            UPSERT {
                user: @user,
                name: 'Yekta'
            }
            INSERT {
                name: 'Yekta',
                user: @user,
                rank: @rank,
                raw_rank: @raw_rank,
                timestamp: @timestamp
            }
            UPDATE {
                rank: @rank,
                raw_rank: @raw_rank,
                timestamp: @timestamp
            }
            IN verifications
        ''', bind_vars={
            'user': n,
            'rank': nodes_rank[n]['rank'],
            'raw_rank': nodes_rank[n]['raw_rank'],
            'timestamp': int(time.time() * 1000)
        })

        for i in range(nodes_rank[n]['rank']):
            verification = f'Yekta_{i + 1}'
            if verification not in verifications.get(n, []):
                db['verifications'].insert({
                    'name': verification,
                    'user': n,
                    'timestamp': int(time.time() * 1000)
                })
    print(f'verifieds: {counter}\n')
