import time
from datetime import datetime
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *
from arango import ArangoClient
from config import *
from verifications import seed_connected
from verifications import call_joined
from verifications import brightid
from verifications import dollar_for_everyone

db = ArangoClient().db('_system')


def process(fname):
    json_graph = from_dump(fname)
    graph = from_json(json_graph)
    reset_ranks(graph)
    ranker = algorithms.Yekta(graph, {})
    ranker.rank()
    draw_graph(ranker.graph, 'nodes.html')
    query = 'FOR u IN users UPDATE { _key: u._key, score: 0 } IN users'
    db.aql.execute(query)

    for node in ranker.graph:
        db['users'].update({'_key': node.name, 'score': node.rank})

    for verifier in [seed_connected, call_joined, brightid, dollar_for_everyone]:
        verifier.verify()


if __name__ == '__main__':
    variables = db.collection('variables')
    if not variables.has('VERIFICATION_BLOCK'):
        variables.insert({
            '_key': 'VERIFICATION_BLOCK',
            'value': 0
        })
    while True:
        snapshots = [fname for fname in os.listdir(
            SNAPSHOTS_PATH) if fname.endswith('.zip')]
        if len(snapshots) == 0:
            time.sleep(1)
            continue
        snapshots.sort(key=lambda fname: int(
            fname.strip('dump_').strip('.zip')))
        fname = os.path.join(SNAPSHOTS_PATH, snapshots[0])
        print(
            '{} - processing {} started ...'.format(str(datetime.now()).split('.')[0], fname))
        process(fname)
        block = int(snapshots[0].strip('dump_').strip('.zip'))
        variables.update({'_key': 'VERIFICATION_BLOCK', 'value': block})
        os.remove(fname)
        print(
            '{} - processing {} completed'.format(str(datetime.now()).split('.')[0], fname))
