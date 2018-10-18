import math
import operator


class Group():
    def __init__(self, name, rank=None, graph=None):
        self.name = name
        self.rank = rank
        self.graph = graph

    def __repr__(self):
        return str(self.name)

    def get_nodes(self):
        return [node for node in self.graph if self.name in node.groups]

    def size(self, graph):
        return len(self.get_nodes())

    @property
    def group_type(self):
        is_seed = True
        for node in self.get_nodes():
            if node.node_type != "Seed":
                # if "seed" in self.name:
                #     print(node, node.node_type)
                is_seed = False
        return "seed" if is_seed else "normal"


class MergedGroup():

    def __init__(self, groups):
        self.groups = groups

    def get_nodes(self, graph):
        nodes = []
        for g in self.groups:
            nodes += g.get_nodes()
        return list(set(nodes))

    @property
    def group_type(self):
        for g in self.groups:
            if g.group_type == "seed":
                return "seed"
        return "normal"

    @property
    def name(self):
        return "_".join([g.name for g in self.groups])

    def __str__(self):
        return self.name


class GroupPair():

    def __init__(self, group1, group2, graph):
        self.group1 = group1
        self.group2 = group2
        self.graph = graph

    def affinity_min(self):
        group1_nodes = self.group1.get_nodes(self.graph)
        group2_nodes = self.group2.get_nodes(self.graph)

        g1_fraction = float(len([n for n in group1_nodes if n in group2_nodes])) / len(group1_nodes)
        g2_fraction = float(len([n for n in group2_nodes if n in group1_nodes])) / len(group2_nodes)

        return min(g1_fraction, g2_fraction)

    def affinity(self):
        group1_nodes = self.group1.get_nodes(self.graph)
        group2_nodes = self.group2.get_nodes(self.graph)

        cons = []
        pairs = []
        for g in group1_nodes:
            found = False
            for g2 in group2_nodes:
                if self.graph.has_edge(g, g2) and g2 not in pairs:
                    found = True
                    pairs.append(g2)
                    break
            if found:
                cons.append(g)

        return float(len(cons))/(len(group1_nodes)+len(group2_nodes))

    def affinity_intersection(self):
        group1_nodes = self.group1.get_nodes(self.graph)
        group2_nodes = self.group2.get_nodes(self.graph)

        both = [g for g in group1_nodes if g in group2_nodes]

        return float(len(cons))/(len(group1_nodes)+len(group2_nodes))

    def is_seed(self):
        return self.group1.group_type == "seed" or self.group2.group_type == "seed"

    def __str__(self):
        return "%s %s %s %s" % (self.group1.name, self.group2.name, self.affinity(), self.is_seed())

    def __cmp__(self, other):
        names = sorted([self.group1.name, self.group2.name])
        other_names = sorted([other.group1.name, other.group2.name])
        return 0 if names == other_names else 1


class GroupMergingRank():

    def __init__(self, graph, options=None):
        self.graph = graph
        self.options = options

        group_names = []
        for node in graph:
            for group in node.groups:
                if group not in group_names:
                    group_names.append(group)

        self.groups = [Group(g, graph=graph) for g in group_names]

        #for g in self.groups:
        #    print(g), g.group_type

        self.merged_groups = [MergedGroup([g]) for g in self.groups]

        self.thresholds = options['thresholds']

        self.group_pairs = []

    def rank(self):
        self.update_ranks(100)
        for th in self.thresholds:
            self.run_threshold(th)

    def update_group_pairs(self):
        self.group_pairs = []
        for g in self.merged_groups:
            for g2 in self.merged_groups:
                if g.name != g2.name and\
                        (g.group_type != "seed" or g2.group_type != "seed"):

                    pair = GroupPair(g, g2, self.graph)
                    if pair not in self.group_pairs:
                        self.group_pairs.append(
                            GroupPair(g, g2, self.graph)
                        )
        # self.update_ranks(100)

    def update_ranks(self, score):
        ending_seed_groups = []
        for merged_group in self.merged_groups:
            if merged_group.group_type == "seed":
                for group in merged_group.groups:
                    ending_seed_groups.append(group)

        for node in self.graph:
            if node.rank:
                continue
            for g in node.groups:
                if g in [i.name for i in ending_seed_groups]:
                    node.rank = score

    def run_threshold(self, threshold):
        self.update_group_pairs()
        self.group_pairs = sorted(self.group_pairs, key=lambda x: x.affinity(), reverse=True)
        for pair in self.group_pairs:
            if pair.affinity() < threshold:
                return False
            self.merge_pair(pair)

            self.update_ranks(threshold * 100)
            return self.run_threshold(threshold)

    def merge_pair(self, pair):
        new_groups = [p for p in self.merged_groups if p not in [pair.group1, pair.group2]]

        merged_group = pair.group1
        for g in pair.group2.groups:
            merged_group.groups.append(g)

        new_groups.append(merged_group)
        self.merged_groups = new_groups
