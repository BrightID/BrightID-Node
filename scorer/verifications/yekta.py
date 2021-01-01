import time
from arango import ArangoClient
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *


def verify(fname):
    print('YEKTA')
    db = ArangoClient().db('_system')
    json_graph = from_dump(fname)
    graph = from_json(json_graph)
    ranker = algorithms.Yekta(graph, {})
    ranker.rank()
    draw_graph(ranker.graph, 'nodes.html')
    counter = dict.fromkeys(range(0, 6), 0)

    for node in ranker.graph:
        counter[node.rank] += 1
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
            'user': node.name,
            'rank': node.rank,
            'raw_rank': node.raw_rank,
            'timestamp': int(time.time() * 1000)
        })
    print(f'verifieds: {counter}\n')
