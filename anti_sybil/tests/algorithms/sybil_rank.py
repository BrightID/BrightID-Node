import sys
import math
import random
import operator
import networkx as nx
from arango import ArangoClient


class SybilRanker():
    def __init__(self, graph, trusted_nodes, max_rank=1.0):
        self.graph = graph
        self.max_rank = max_rank
        self.honests_predicted = None
        self.verifiers = trusted_nodes

    def detect(self):
        num_iterations = int(math.ceil(math.log10(self.graph.order())))
        # TODO: Whats the best num_iterations?
        num_iterations = 10
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
        # divide ranks by degree
        for node, rank in nodes_rank.iteritems():
            node_degree = self.graph.degree(node)
            nodes_rank[node] = rank / float(node_degree)
        ranks = sorted(nodes_rank.iteritems(),
                              key=operator.itemgetter(1))

        # fix distribution
        max_rank = max(ranks, key=lambda item: item[1])[1]
        min_rank = min(ranks, key=lambda item: item[1])[1]
        ranks = [(node, int(round((rank - min_rank) * 100 / (max_rank - min_rank)))) for node, rank in ranks]
        return ranks