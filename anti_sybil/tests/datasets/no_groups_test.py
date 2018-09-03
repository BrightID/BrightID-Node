import networkx as nx
import random


class Node():
    def __init__(self, name, node_type, rank=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank


def init(input_data):
    num_sybil = int(input_data['num_sybil_to_num_honest'] * input_data['num_honest'])
    categories = {
        'Honest': {'nodes': [], 'color': 'green', 'num': input_data['num_honest']},
        'Sybil': {'nodes': [], 'color': 'red', 'num': num_sybil},
    }
    graph = nx.Graph()
    counter = 0
    for category in categories:
        for i in range(categories[category]['num']):
            node = Node(counter, category)
            categories[category]['nodes'].append(node)
            graph.add_node(node)
            counter += 1
    low_degree = range(input_data['min_degree'], input_data['avg_degree'])
    up_degrees = range(input_data['avg_degree'], input_data['max_degree'] + 1)
    for i, node in enumerate(categories['Honest']['nodes']):
        node_degree = graph.degree(node)
        peresent_graph_degree = sum(degree for node, degree in graph.degree()) / (i + 1)
        if peresent_graph_degree < input_data['avg_degree']:
            degree = random.choice(up_degrees)
        else:
            degree = random.choice(low_degree)
        j = 0
        pairs = []
        while j < degree:
            pair = random.choice(categories['Honest']['nodes'])
            if node != pair and graph.degree(pair) < input_data['max_degree'] and pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1
            # TODO: Check if infinit loop is possible
            # else:
            #     print(node.name, pair.name)

    num_sybil_con = input_data['sybil_con_to_honest_con'] * input_data['avg_degree']
    for i, node in enumerate(categories['Sybil']['nodes']):
        j = 0
        pairs = []
        while j < num_sybil_con:
            pair = random.choice(categories['Honest']['nodes'])
            if pair not in pairs:
                graph.add_edge(node, pair)
                j += 1
        # TODO: What about conctions between NonBridgeSybils?

    return graph, categories
