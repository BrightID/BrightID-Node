import sybil_rank
import networkx as nx
import itertools
from anti_sybil.graphs.node import Node


class SybilGroupRank(sybil_rank.SybilRank):

    def __init__(self, graph, options=None):
        sybil_rank.SybilRank.__init__(self, graph, options)
        self.min_group_req = self.options.get('min_group_req', 1)
        groups = {}
        for node in self.graph.nodes:
            for group in node.groups:
                if group not in groups:
                    groups[group] = set()
                groups[group].add(node)
        self.groups = groups
        self.group_graph = self.gen_group_graph()

    def rank(self):
        ranker = sybil_rank.SybilRank(self.group_graph, self.options)
        ranker.rank()
        groups_ranks = {g.name: (g.raw_rank, g.rank) for g in self.group_graph.nodes}

        for node in self.graph.nodes:
            if len(node.groups) < self.min_group_req:
                node.raw_rank = node.rank = 0
                node.node_type = 'New'
            else:
                max_group = max(node.groups, key=lambda g: groups_ranks.get(g, [-1])[0])
                node.raw_rank, node.rank = groups_ranks.get(max_group, [0, 0])
        return self.group_graph

    @staticmethod
    def get_group_type(group_nodes):
        flag = set([node.node_type for node in group_nodes])
        if flag == set(['Seed']):
            group_type = 'Seed'
        elif flag == set(['Sybil', 'Attacker']):
            group_type = 'Sybil'
        else:
            group_type = 'Honest'
        return group_type

    def gen_group_graph(self):
        group_graph = nx.Graph()
        groups_dic = dict([(group, Node(group, self.get_group_type(self.groups[group]))) for group in self.groups])
        pairs = itertools.combinations(self.groups.keys(), 2)
        pairs = sorted([(f, t) if f < t else (t, f) for f, t in pairs], key=lambda pair: str(pair))
        for source_group, target_group in pairs:
            removed = set()
            weight = 0
            source_nodes = self.groups[source_group]
            target_nodes = self.groups[target_group]
            if self.min_group_req > 1:
                source_nodes = filter(lambda n: len(n.groups) >= self.min_group_req, source_nodes)
                target_nodes = filter(lambda n: len(n.groups) >= self.min_group_req, target_nodes)
            for source_node in source_nodes:
                if source_node in removed:
                    continue
                for target_node in target_nodes:
                    if source_node in removed:
                        break
                    if target_node in removed:
                        continue
                    if not self.graph.has_edge(source_node, target_node):
                        continue
                    removed.add(source_node)
                    removed.add(target_node)
                    weight += 1
            if weight > 0:
                num = len(source_nodes) + len(target_nodes)
                group_graph.add_edge(groups_dic[source_group], groups_dic[target_group], weight=1.0 * weight / num)
        return group_graph
