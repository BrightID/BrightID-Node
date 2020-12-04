import time
from .utils import documents
from arango import ArangoClient
from anti_sybil.utils import draw_graph
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *


def verify(fname, past_block, current_block):
    print('YEKTA')
    json_graph = from_dump(fname)
    graph = from_json(json_graph)
    ranker = algorithms.Yekta(graph, {})
    ranker.rank()
    # draw_graph(ranker.graph, 'nodes.html')

    db = ArangoClient().db('_system')
    counter = dict.fromkeys(range(0, 6), 0)
    for node in ranker.graph:
        counter[node.rank] += 1
        db['verifications'].insert({
            'name': 'Yekta',
            'user': node.name,
            'rank': node.rank,
            'raw_rank': node.raw_rank,
            'timestamp': int(time.time() * 1000),
            'block': current_block
        })
    print(f'verifieds: {counter}\n')
