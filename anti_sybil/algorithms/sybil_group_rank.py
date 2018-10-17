import sybil_rank
import networkx as nx
import itertools
from graphs.node import Node


class SybilGroupRank(sybil_rank.SybilRank):

    def __init__(self, graph, options=None):
        sybil_rank.SybilRank.__init__(self, graph, options)
        groups = {}
        for node in self.graph.nodes:
            for group in node.groups:
                if not group in groups:
                    groups[group] = set()
                groups[group].add(node)
        self.groups = groups
        self.group_graph = self.gen_group_graph()

    def rank(self):
        ranker = sybil_rank.SybilRank(self.group_graph, self.options)
        ranker.rank()
        groups_ranks = {g.name: (g.raw_rank, g.rank) for g in self.group_graph.nodes}
        for node in self.graph.nodes:
            max_group = max(node.groups, key=lambda g: groups_ranks[g][0])
            node.raw_rank, node.rank = groups_ranks[max_group]
        if 'weaken_inconsistency_ratio' in self.options:
            self.set_inconsistency()
            sorted_groups = sorted([group for group in self.group_graph.nodes], key=lambda g: g.inconsistency, reverse=True)
            index = int(len(sorted_groups) * self.options['weaken_inconsistency_ratio'])
            border = sorted_groups[index].inconsistency
            for group in self.group_graph:
                if group.inconsistency > border:
                    group.raw_rank = group.raw_rank / (group.inconsistency / border) ** 2
        if 'min_neighborhood_factor' in self.options:
            self.set_neighborhood_factor()
            sorted_groups = sorted([group for group in self.group_graph.nodes], key=lambda g: g.neighborhood_factor)
            border = self.options['min_neighborhood_factor']
            for group in self.group_graph:
                if group.neighborhood_factor < border:
                    group.raw_rank = group.raw_rank * (group.neighborhood_factor / border)
        if 'min_neighborhood_factor' in self.options or if 'weaken_inconsistency_ratio' in self.options:
            ranks = dict((group, group.raw_rank) for group in self.group_graph.nodes)
            ranked_trust = dict(ranker.normalize_nodes_rank(ranks))
            for group in self.group_graph.nodes:
                group.rank = ranked_trust[group]
            groups_ranks = {g.name: (g.raw_rank, g.rank) for g in self.group_graph.nodes}
            for node in self.graph.nodes:
                max_group = max(node.groups, key=lambda g: groups_ranks[g][0])
                node.raw_rank, node.rank = groups_ranks[max_group]
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
        group_graph = nx.Graph()
        groups_dic = dict([(group, Node(group, self.get_group_type(self.groups[group]))) for group in self.groups])
        pairs = itertools.combinations(self.groups.keys(), 2)
        pairs = sorted([(f, t) if f < t else (t, f) for f, t in pairs], key=lambda pair: str(pair))
        conn_ratio_dic = {}
        for source_group, target_group in pairs:
            removed = set()
            weight = 0
            source_nodes = sorted(self.groups[source_group], key=lambda n: n.name)
            for source_node in source_nodes:
                if source_node in removed:
                    continue
                target_nodes = sorted(self.groups[target_group], key=lambda n: n.name)
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
                num = len(self.groups[source_group]) + len(self.groups[target_group])
                group_graph.add_edge(groups_dic[source_group], groups_dic[target_group], weight=1.0*weight/num)
        return group_graph

    def set_inconsistency(self):
        groups_dict = {group_object.name: group_object for group_object in self.group_graph.nodes}
        for group in self.groups:
            nodes = sorted(self.groups[group], key=lambda n: n.name)
            node_neighbors_dict = {}
            for node in nodes:
                node_neighbors_dict[node] = set()
                for neighbor in self.graph.neighbors(node):
                    if not group in neighbor.groups:
                        node_neighbors_dict[node].update(neighbor.groups)
            nodes_activity = [sum([groups_dict[g].raw_rank for g in node_neighbors_dict[node]]) for node in nodes]
            avg_activity = sum(nodes_activity) / len(nodes_activity)
            actives = [activity for activity in nodes_activity if activity >= avg_activity]
            inactives = [activity for activity in nodes_activity if activity <= avg_activity]
            # It should never happens but in some situations takes place because of floating point problems.
            if len(actives) == 0 or len(inactives) == 0:
                groups_dict[group].inconsistency = 0
                continue
            avg_actives = sum(actives) / len(actives)
            avg_inactives = sum(inactives) / len(inactives)
            if avg_inactives > 0:
                inconsistency = avg_actives / avg_inactives
            else:
                inconsistency = None
            multiplier = (float(len(inactives)) / len(actives)) ** .5
            if multiplier > 1 and inconsistency != None:
                inconsistency *= multiplier
            groups_dict[group].inconsistency = inconsistency
        max_inconsistencies = max([node.inconsistency for node in self.group_graph.nodes])
        for group in self.groups:
            if groups_dict[group].inconsistency == None:
                groups_dict[group].inconsistency = max_inconsistencies

    def set_neighborhood_factor(self):
        for group in self.group_graph:
            neighboring_nodes = set()
            nodes = sorted(self.groups[group.name], key=lambda n: n.name)
            for node in nodes:
                for neighbor in self.graph.neighbors(node):
                    if not group.name in neighbor.groups and neighbor.rank >= self.options['min_reliable_rank']:
                        neighboring_nodes.add(neighbor)
            group.neighborhood_factor = min(len(neighboring_nodes), self.group_graph.degree(group))
