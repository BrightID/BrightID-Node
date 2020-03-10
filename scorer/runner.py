import time
from datetime import datetime
import anti_sybil.algorithms as algorithms
from anti_sybil.utils import *
from arango import ArangoClient
from config import *

def update(nodes_graph, groups_graph):
    db = ArangoClient().db('_system')
    for node in nodes_graph.nodes:
        db['users'].update({'_key': node.name, 'score': node.rank})
    for group in groups_graph.nodes:
        db['groups'].update({'_key': group.name, 'score': group.rank,
                             'raw_rank': group.raw_rank, 'degree': group.degree})
    db.aql.execute("""
    FOR u in users
        FILTER u.score > 90 && ( !u.verifications || 'NodeOne' not in u.verifications || 'BrightID' not in u.verifications ) 
        update u with { verifications: append(u.verifications, ['NodeOne', 'BrightID'], true) } in users
        OPTIONS { exclusive: true }
    """)
    db.aql.execute("""
    FOR dfe in users
        FILTER dfe.dfeAdmin == true
        FOR c in connections
            FILTER ( c._from == dfe._id || c._to == dfe._id ) && c.timestamp > 1564600000000
            FOR u in users
                FILTER ( u._id == c._from || u._id == c._to )
                && ( !u.verifications || 'DollarForEveryone' not in u.verifications )
                update u with { verifications: append(u.verifications, ['DollarForEveryone'], true) } in users
                OPTIONS { exclusive: true }
    """)
    db.aql.execute("""
    FOR dfe in users
        FILTER dfe.dfeAdminB == true
        FOR c in connections
            FILTER ( c._from == dfe._id || c._to == dfe._id ) && c.timestamp > 1564600000000
            FOR u in users
                FILTER ( u._id == c._from || u._id == c._to )
                && 'BrightID' in u.verifications
                && 'DollarForEveryone' not in u.verifications
                update u with { verifications: append(u.verifications, ['DollarForEveryone'], true) } in users
                OPTIONS { exclusive: true }
    """)


def stupid_sybil_border(graph):
    reset_ranks(graph)
    ranker = algorithms.SybilGroupRank(graph)
    ranker.rank()
    attacker = max(graph.nodes, key=lambda node: node.rank)
    attacker.groups.add('stupid_sybil')
    sybil1 = graphs.node.Node('stupid_sybil_1', 'Sybil', set(['stupid_sybil']))
    sybil2 = graphs.node.Node('stupid_sybil_2', 'Sybil', set(['stupid_sybil']))
    graph.add_edge(attacker, sybil1)
    graph.add_edge(attacker, sybil2)
    reset_ranks(graph)
    ranker = algorithms.SybilGroupRank(graph)
    ranker.rank()
    border = max(sybil1.raw_rank, sybil2.raw_rank)
    graph.remove_nodes_from([sybil1, sybil2])
    attacker.groups.remove('stupid_sybil')
    reset_ranks(graph)
    return border


def process(fname):
    with open(fname) as f:
        json_graph = from_dump(f)
    graph = from_json(json_graph)
    border = stupid_sybil_border(graph)
    raw_ranks = [node.raw_rank for node in graph.nodes]
    print('''stupid border: {}
max: {}
min: {}
avg: {}'''.format(border, max(raw_ranks), min(raw_ranks), sum(raw_ranks) / len(raw_ranks)))
    reset_ranks(graph)
    ranker = algorithms.SybilGroupRank(graph, {
        'stupid_sybil_border': border
    })
    ranker.rank()
    draw_graph(ranker.graph, 'nodes.html')
    draw_graph(ranker.group_graph, 'groups.html')
    update(ranker.graph, ranker.group_graph)

if __name__ == '__main__':
    while True:
        snapshots = [fname for fname in os.listdir(SNAPSHOTS_PATH) if fname.endswith('.zip')]
        if len(snapshots) == 0:
            time.sleep(1)
            continue
        snapshots.sort(key = lambda fname: int(fname.strip('dump_').strip('.zip')))
        fname = os.path.join(SNAPSHOTS_PATH, snapshots[0])
        print('{} - processing {} started ...'.format(str(datetime.now()).split('.')[0], fname))
        process(fname)
        os.remove(fname)
        print('{} - processing {} completed'.format(str(datetime.now()).split('.')[0], fname))
