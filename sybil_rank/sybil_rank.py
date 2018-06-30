import sys
import networkx as nx
from arango import ArangoClient
sys.path.append("../")
import sypy
from config import *

def score():
    # making sybil region randomly
    sybil_region = sypy.Region(
        graph = sypy.PowerLawGraph(
            num_nodes=SYBIL_NUM_NODES,
            node_degree=SYBIL_NODE_DEGREE,
            prob_triad=SYBIL_PROB_TRIAD
        ),
        name = "SybilCompleteGraph",
        is_sybil=True
    )
    sybil_stats = sybil_region.get_region_stats()
    assert sybil_stats.is_connected == True
    
    # making honest region from database
    g = load()
    nxg = nx.Graph()
    nxg.add_nodes_from(g['vertices'])
    nxg.add_edges_from(g['edges'])
    honest_region = sypy.Region(
        graph = sypy.CustomGraph(nxg),
        name="HonestGraph"
    )
    honest_region.pick_random_honest_nodes(num_nodes=TRUSTED_NODES_NUM)
    honest_stats = honest_region.get_region_stats()
    assert honest_stats.is_connected == True
    
    # making network by stitching honested and sybil regions
    social_network = sypy.Network(
        left_region=honest_region,
        right_region=sybil_region,
        name="OnlineSocialNetwork"
    )
    social_network.random_pair_stitch(num_edges=STITCH_NUM)

    # calculate sybil ranks
    detector = sypy.SybilRankDetector(social_network, pivot=SYBIL_FRACTION)
    results = detector.detect()
    print('i\tnode\trank\ttype')
    for i, (n, r) in enumerate(detector.ranked_trust):
        print('{0}\t{1}\t{2:.4f}\t{3}'.format(i+1, n, r, 'Honest' if n in detector.honests_truth else 'Sybile'))
    print "accuracy={0:.2f}, sensitivity={1:.2f}, specificity={2:.2f}".format(
        results.accuracy(),
        results.sensitivity(),
        results.specificity()
    )
    social_network.visualize()

def to_int(s):
    return int(''.join([c for c in s if c.isdigit()]))

def load():
    client = ArangoClient()
    db = client.db(DB_NAME)
    users = db.collection('users')
    community = db.graph('community')
    connections = community.edge_collection('connections')
    return {
        'edges': [(to_int(con['_from']), to_int(con['_to'])) for con in connections],
        'vertices': [to_int(user['_id']) for user in users]
    }

if __name__ == '__main__':
    score()
