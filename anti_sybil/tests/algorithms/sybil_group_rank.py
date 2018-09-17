import sybil_rank
import networkx as nx


class Node():

    def __init__(self, name, node_type, rank=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank
        self.groups = set()

    def __repr__(self):
        return str(self.name)


class SybilGroupRank(sybil_rank.SybilRank):

    def __init__(self, graph, options=None):
        sybil_rank.SybilRank.__init__(self, graph, options)
        groups = {}
        for node in self.graph.nodes():
            for group in node.groups:
                if not group in groups:
                    groups[group] = []
                groups[group].append(node)
        self.groups = groups
        self.group_graph = self.gen_group_graph()

    def rank(self):
        ranker = sybil_rank.SybilRank(self.group_graph, self.options)
        ranker.rank()
        node_groups_rank = {}
        for group_node in self.group_graph.nodes:
            for node in self.groups[group_node.name]:
                if node not in node_groups_rank:
                    node_groups_rank[node] = []
                node_groups_rank[node].append(group_node.rank)
        for node in self.graph:
            node.rank = max(node_groups_rank[node])
        return self.group_graph

    def get_group_type(self, group_nodes):
        flag = set([node.node_type for node in group_nodes])
        if flag == set(['Seed']):
            group_type = 'Seed'
        elif flag == set(['Sybil', 'Attacker']):
            group_type = 'Sybil'
        else:
            group_type = 'Honest'
        return group_type

    def gen_group_graph(self):
        dic_nodes = {}
        group_graph = nx.Graph()
        for edge in self.graph.edges():
            for source_group in edge[0].groups:
                if source_group not in dic_nodes:
                    dic_nodes[source_group] = Node(
                        source_group, self.get_group_type(self.groups[source_group]))
                for target_group in edge[1].groups:
                    if target_group not in dic_nodes:
                        dic_nodes[target_group] = Node(
                            target_group, self.get_group_type(self.groups[target_group]))
                    if source_group == target_group:
                        continue
                    source = dic_nodes[source_group]
                    target = dic_nodes[target_group]
                    weight = 1.0 / (len(self.groups[source_group]) + len(self.groups[target_group]))
                    if group_graph.has_edge(source, target):
                        group_graph[source][target]['weight'] += weight
                    else:
                        group_graph.add_edge(source, target, weight = weight)
        return group_graph
