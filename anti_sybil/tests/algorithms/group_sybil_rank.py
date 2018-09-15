import math
import operator


class GroupSybilRank():
    def __init__(self, graph, options=None):
        groups = {}
        for node in graph.nodes():
            for group in node.groups:
                if group in groups:
                    groups[group].append(node)
                else:
                    groups[group] = [node]
        self.graph = graph
        self.honests_predicted = None
        self.verifiers = [node for node in graph.nodes if node.node_type == 'Seed']
        self.options = options
        self.groups = groups

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

    def nonlinear_distribution(self, ranks, ratio, df, dt):
        nums = [rank[1] * 10000 for rank in ranks]
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
            ret.append(int(num))
        return [(ranks[i][0], ret[i]) for i, rank in enumerate(ranks)]

    def linear_distribution(self, ranks):
        max_rank = max(ranks, key=lambda item: item[1])[1]
        min_rank = min(ranks, key=lambda item: item[1])[1]
        ranks = [(node, int(round((rank - min_rank) * 100 / (max_rank - min_rank))))
                 for node, rank in ranks]
        return ranks


    def normalize_nodes_rank(self, nodes_rank):
        final_nodes_rank = {}
        for node, rank in nodes_rank.iteritems():
            node_degree = self.graph.degree(node)
            final_nodes_rank[node] = sum(nodes_rank[node].values()) / float(node_degree)
        ranks = sorted(final_nodes_rank.iteritems(),
                       key=operator.itemgetter(1))
        if self.options['nonlinear_distribution']:
            ranks = self.nonlinear_distribution(ranks, .5, 10, 90)
        else:
            ranks = self.linear_distribution(ranks)
        return ranks
