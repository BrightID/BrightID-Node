import time
from arango import ArangoClient
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *
from . import utils
import config


def verify(block):
    print('YEKTA')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    json_graph = from_db('snapshot')
    graph = from_json(json_graph)
    ranker = algorithms.Yekta(graph, {})
    ranker.rank()
    counter = dict.fromkeys(range(0, 6), 0)

    for node in ranker.graph:
        counter[node.rank] += 1
        db['verifications'].insert({
            'name': 'Yekta',
            'user': node.name,
            'rank': node.rank,
            'raw_rank': node.raw_rank,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('Yekta', node.name, node.rank)
        })

    print(f'verifieds: {counter}\n')
