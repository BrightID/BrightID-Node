import sys
import math
import random
import operator
import networkx as nx
from arango import ArangoClient
from db_config import *

class SybilRanker():
    def __init__(self, graph, honests_truth, trusted_nodes, max_rank=1.0):
        self.graph = graph
        self.max_rank = max_rank
        self.honests_truth = honests_truth
        self.honests_predicted = None
        self.verifiers = trusted_nodes

    def detect(self):
        num_iterations = int(math.ceil(math.log10(self.graph.order())))
        nodes_rank = self.initialize_nodes_rank()
        for i in range(num_iterations):
            nodes_rank = self.spread_nodes_rank(nodes_rank)
        ranked_trust = self.normalize_nodes_rank(nodes_rank)
        self.ranked_trust = ranked_trust
        return self

    def initialize_nodes_rank(self):
        nodes_rank = dict((node, 0.0) for node in self.graph.nodes())
        for verifier in self.verifiers:
            nodes_rank[verifier] = self.max_rank / float(len(self.verifiers))
        return nodes_rank

    def spread_nodes_rank(self, nodes_rank):
        new_nodes_rank = {}
        for node, rank in nodes_rank.iteritems():
            new_trust = 0.0
            neighbors = self.graph.neighbors(node)
            for neighbor in neighbors:
                neighbor_degree = self.graph.degree(neighbor)
                new_trust += nodes_rank[neighbor] / float(neighbor_degree)
            new_nodes_rank[node] = new_trust
        return new_nodes_rank

    def normalize_nodes_rank(self, nodes_rank):
        for node, rank in nodes_rank.iteritems():
            node_degree = self.graph.degree(node)
            nodes_rank[node] = rank / float(node_degree)
        ranked_trust = sorted(nodes_rank.iteritems(), key=operator.itemgetter(1))
        return ranked_trust

def score():    
    # making social graph graph from database
    g = load()
    social_network = nx.Graph()
    social_network.add_nodes_from(g['vertices'])
    social_network.add_edges_from(g['edges'])
    # check the graph is connected
    assert len(nx.connected_components(social_network)) == 1
    # calculate sybil ranks
    detector = SybilRanker(social_network, g['honest_nodes'], g['trusted_nodes'])
    results = detector.detect()
    print('i\tnode\trank\ttype')
    for i, (n, r) in enumerate(detector.ranked_trust):
        print('{0}\t{1}\t{2:.4f}\t{3}'.format(i+1, n, r, 'Honest' if n in detector.honests_truth else 'Sybile'))

def to_int(s):
    return int(''.join([c for c in s if c.isdigit()]))

def load():
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    users = db.collection('users')
    community = db.graph('community')
    connections = community.edge_collection('connections')
    return {
        'edges': [(to_int(con['_from']), to_int(con['_to'])) for con in connections],
        'vertices': [to_int(user['_id']) for user in users],
        'honest_nodes': [to_int(user['_id']) for user in users if user['type'] == 'honest'],
        'trusted_nodes': [to_int(user['_id']) for user in users if user['trusted']]
    }

if __name__ == '__main__':
    score()