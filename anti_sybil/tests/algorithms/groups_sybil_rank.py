import sys
import math
import operator
import networkx as nx
from arango import ArangoClient


class Detector():
    def __init__(self, graph, trusted_nodes, options=None):
        groups = {}
        for node in graph.nodes():
            for group in node.groups:
                if group in groups:
                    groups[group].append(node)
                else:
                    groups[group] = [node]
        self.graph = graph
        self.honests_predicted = None
        self.verifiers = trusted_nodes
        self.options = options
        self.groups = groups

    def detect(self):
        num_iterations = int(math.ceil(math.log10(self.graph.order())))
        # TODO: Whats the best num_iterations?
        nodes_rank = self.initialize_nodes_rank()
        for i in range(num_iterations):
            nodes_rank = self.spread_nodes_rank(nodes_rank)
        ranked_trust = dict(self.normalize_nodes_rank(nodes_rank))
        self.ranked_trust = ranked_trust
        return ranked_trust

    def initialize_nodes_rank(self):
        nodes_rank = {}
        for node in self.graph.nodes():
            nodes_rank[node] = {}
            for group in self.groups:
                if node in self.verifiers:
                    nodes_rank[node][group] = 1.0 / float(len(self.verifiers))
                else:
                    nodes_rank[node][group] = 0.0
        return nodes_rank

    def spread_nodes_rank(self, nodes_rank):
        new_nodes_rank = {}
        for node in self.graph.nodes():
            new_nodes_rank[node] = {}
            for group in self.groups:
                new_nodes_rank[node][group] = 0.0
        for node, rank in nodes_rank.iteritems():
            neighbors = self.graph.neighbors(node)
            for neighbor in neighbors:
                neighbor_degree = self.graph.degree(neighbor)
                for group in self.groups:
                    if self.options['accumulative']:
                        new_trust = nodes_rank[node][group]
                    else:
                        new_trust = 0.0
                    temp_trust = nodes_rank[neighbor][group] / float(neighbor_degree)
                    if group in list(set(node.groups) & set(neighbor.groups)):
                        new_trust += temp_trust * self.options['group_edge_weight']
                    else:
                        new_trust += temp_trust
                    new_nodes_rank[node][group] += new_trust
                    if self.options['weaken_under_min'] and self.options['min_degree']:
                        degree = self.graph.degree(node)
                        if degree < self.options['min_degree']:
                            reducer = (self.options['min_degree'] - degree) ** .5
                            new_nodes_rank[node][group] = new_trust / reducer
        return new_nodes_rank

    def normalize_nodes_rank(self, nodes_rank):
        final_nodes_rank = {}
        # divide ranks by degree
        for node, rank in nodes_rank.iteritems():
            node_degree = self.graph.degree(node)
            final_nodes_rank[node] = sum(nodes_rank[node].values()) / float(node_degree)
        ranks = sorted(final_nodes_rank.iteritems(),
                       key=operator.itemgetter(1))

        # fix distribution
        max_rank = max(ranks, key=lambda item: item[1])[1]
        min_rank = min(ranks, key=lambda item: item[1])[1]
        ranks = [(node, int(round((rank - min_rank) * 100 / (max_rank - min_rank))))
                 for node, rank in ranks]
        return ranks
