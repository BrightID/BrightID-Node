import math
import operator


class SybilRank():

    def __init__(self, graph, options=None):
        self.graph = graph
        self.verifiers = [node for node in graph.nodes if node.node_type == 'Seed']
        self.options = options if options else {}

    def rank(self):
        num_iterations = max(3, int(math.ceil(math.log10(self.graph.order()))))
        # TODO: Whats the best num_iterations?
        nodes_rank = self.initialize_nodes_rank()
        for i in range(num_iterations):
            nodes_rank = self.spread_nodes_rank(nodes_rank)
        for node in self.graph.nodes:
            node.degree = self.graph.degree(node, weight='weight')
        self.ranked_trust = dict(self.normalize_nodes_rank(nodes_rank))
        for node in self.graph.nodes:
            node.rank = self.ranked_trust[node]
        return self.graph

    def initialize_nodes_rank(self):
        nodes_rank = dict((node, 0.0) for node in self.graph.nodes)
        for verifier in self.verifiers:
            nodes_rank[verifier] = 1.0 / float(len(self.verifiers))
        return nodes_rank

    def spread_nodes_rank(self, nodes_rank):
        accumulative = self.options.get('accumulative', False);
        new_nodes_rank = {}
        for node, rank in nodes_rank.iteritems():
            new_trust = 0.0
            if accumulative:
                new_trust = rank
            neighbors = self.graph.neighbors(node)
            for neighbor in neighbors:
                neighbor_degree = self.graph.degree(neighbor, weight='weight')
                if neighbor_degree > 0:
                    new_trust += (nodes_rank[neighbor] * self.graph[node][neighbor].get('weight', 1)) / float(neighbor_degree)
            new_nodes_rank[node] = new_trust

        return new_nodes_rank

    @staticmethod
    def nonlinear_distribution(ranks, ratio, df, dt):
        avg_floating_points = sum([int(('%E'%rank[1]).split('E')[1]) for rank in ranks])/float(len(ranks))
        multiplier = 10 ** (-1 * (avg_floating_points - 1))
        nums = [rank[1] * multiplier for rank in ranks]
        counts = {}
        for num in nums:
            counts[int(num)] = counts.get(int(num), 0) + 1
        navg = sum(sorted(nums)[len(nums)/10:-1*len(nums)/10]) / (.8*len(nums))
        navg = int(navg)
        max_num = max(nums)
        # find distance from average which include half of numbers
        distance = 0
        while True:
            distance += 1
            count = sum([counts.get(i, 0) for i in range(navg-distance, navg+distance)])
            if count > len(nums)*ratio:
                break
        f, t = navg-distance, navg+distance
        ret = []
        for num in nums:
            if 0 <= num < f:
                num = num*df / f
            elif f <= num < t:
                num = df + (((num-f) / (t-f)) * (dt-df))
            else:
                num = dt + (((num-t) / (max_num-t)) * (100-dt))
            ret.append(round(num, 2))
        return [(ranks[i][0], ret[i]) for i, rank in enumerate(ranks)]

    @staticmethod
    def linear_distribution(ranks):
        max_rank = max(ranks, key=lambda item: item[1])[1]
        min_rank = min(ranks, key=lambda item: item[1])[1]
        ranks = [(node, round((rank - min_rank) * 100 / (max_rank - min_rank), 2))
                 for node, rank in ranks]
        return ranks

    @staticmethod
    def border_based_distribution(ranks, border):
        max_rank = max(ranks, key=lambda item: item[1])[1]
        res = []
        for node, rank in ranks:
            if rank < border:
                new_rank = 10*rank / border
            else:
                new_rank = 90 + 10*(rank - border)/(max_rank - border)
            res.append((node, round(new_rank, 2)))
        return res

    def normalize_nodes_rank(self, nodes_rank):
        for node, rank in nodes_rank.iteritems():
            node_degree = self.graph.degree(node)
            nodes_rank[node] = rank / float(node_degree)
            node.raw_rank = nodes_rank[node]
        ranks = nodes_rank.items()
        if self.options.get('nonlinear_distribution', False):
            ranks = self.nonlinear_distribution(ranks, .5, 10, 90)
        elif self.options.get('stupid_sybil_border', False):
            border = self.options['stupid_sybil_border']
            ranks = self.border_based_distribution(ranks, border)
        else:
            ranks = self.linear_distribution(ranks)
        return ranks
