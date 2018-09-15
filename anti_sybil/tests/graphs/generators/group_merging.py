import networkx as nx
import collections
import random

class Node():
    def __init__(self, name, node_type=None, rank=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank
        self.groups = set()

    def __repr__(self):
        return str(self.name)

class Group():
    def __init__(self, name, group_type, rank=None):
        self.name = name
        self.group_type = group_type
        self.rank = rank

    def __repr__(self):
        return str(self.name)

    def get_nodes(self, graph):
        is_in_group=lambda node: self.name in [g.name for g in node.groups]
        return [node for node in graph if is_in_group(node)]

    def size(self, graph):
        return len(self.get_nodes(graph))

def generate(input_data):
    graph = nx.Graph()

    group_size = input_data['num_groups']
    group_objs = []
    for i in range(group_size):
        group_type = 'seed' if random.random() < 0.2 else "normal"
        group_objs.append(
            Group("group_%s" % i, group_type)
        )

    all_nodes = [Node(i) for i in range(input_data['nodes'])]
    indexes = range(input_data['nodes'])
    for g in group_objs:
        group_size = random.randint(input_data['min_group_nodes'], input_data['max_group_nodes'])
        group_node_indexes = random.sample(indexes, group_size)
        for i in group_node_indexes:
            all_nodes[i].groups.add(g)

    for node in all_nodes:
        graph.add_node(node)

    for i in indexes:
        for j in indexes:
            if random.random() < 0.4:
                graph.add_edge(all_nodes[i], all_nodes[j])

    return graph, group_objs
