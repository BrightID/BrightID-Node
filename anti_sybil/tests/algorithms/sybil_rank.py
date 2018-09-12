import math
import operator


class SybilRank():
    def __init__(self, graph, options=None):
        self.graph = graph
        self.verifiers = [node for node in graph.nodes if node.node_type == 'Seed']
        self.options = options

    def rank(self):
        num_iterations = int(math.ceil(math.log10(self.graph.order())))
        # TODO: Whats the best num_iterations?
        nodes_rank = self.initialize_nodes_rank()
        for i in range(num_iterations):
            nodes_rank = self.spread_nodes_rank(nodes_rank)
        self.ranked_trust = dict(self.normalize_nodes_rank(nodes_rank))
        for node in self.graph.nodes:
            node.rank = self.ranked_trust[node]
        return self.graph

    def initialize_nodes_rank(self):
        nodes_rank = dict((node, 0.0) for node in self.graph.nodes())
        for verifier in self.verifiers:
            nodes_rank[verifier] = 1.0 / float(len(self.verifiers))
        return nodes_rank

    def spread_nodes_rank(self, nodes_rank):
        new_nodes_rank = {}
        for node, rank in nodes_rank.iteritems():
            new_trust = 0.0
            if self.options['accumulative']:
                new_trust = rank
            neighbors = self.graph.neighbors(node)
            for neighbor in neighbors:
                neighbor_degree = self.graph.degree(neighbor)
                new_trust += nodes_rank[neighbor] / float(neighbor_degree)
            degree = self.graph.degree(node)
            new_nodes_rank[node] = new_trust
            if self.options['weaken_under_min'] and self.options['min_degree']:
                if degree < self.options['min_degree']:
                    reducer = (self.options['min_degree'] - degree) ** .5
                    new_nodes_rank[node] = new_trust / reducer
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
        ranks = [(node, int(round((rank - min_rank) * 100 / (max_rank - min_rank))))
                 for node, rank in ranks]
        return ranks
