import networkx as nx
import random


class Node():
    def __init__(self, name, node_type, rank=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank


def init(input_data):
    num_attacker = int(input_data['num_attacker_to_num_honest'] * input_data['num_honest'])
    num_sybil = int(input_data['num_sybil_to_num_attacker'] * num_attacker)
    num_bridge_sybil = int(input_data['num_bridge_to_num_non_bridge'] * num_sybil)
    num_non_bridge_sybil = num_sybil - num_bridge_sybil
    categories = {
        'Honest': {'nodes': [], 'color': 'green', 'num': input_data['num_honest']},
        'Bridge_sybil': {'nodes': [], 'color': 'orange', 'num': num_bridge_sybil},
        'Non_bridge_sybil': {'nodes': [], 'color': 'red', 'num': num_non_bridge_sybil},
        'Attacker': {'nodes': [], 'color': 'black', 'num': num_attacker}
    }
    graph = nx.Graph()
    counter = 0
    for category in categories:
        for i in range(categories[category]['num']):
            node = Node(counter, category)
            categories[category]['nodes'].append(node)
            graph.add_node(node)
            counter += 1
    low_degrees = range(input_data['min_degree'], input_data['avg_degree'])
    up_degrees = range(input_data['avg_degree'], input_data['max_degree']+1)
    non_sybils = categories['Honest']['nodes']+categories['Attacker']['nodes']
    for i, node in enumerate(non_sybils):
        node_degree = graph.degree(node)
        peresent_graph_degree = sum(degree for node, degree in graph.degree()) / (i + 1)
        if peresent_graph_degree < input_data['avg_degree']:
            degree = random.choice(up_degrees)
        else:
            degree = random.choice(low_degrees)
        j = 0
        pairs = []
        while j < degree:
            pair = random.choice(non_sybils)
            if node != pair and graph.degree(pair) < input_data['max_degree'] and pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1
            # TODO: Check if infinit loop is possible
            # else:
            #     print(node.name, pair.name)

    for i, node in enumerate(categories['Non_bridge_sybil']['nodes']):
        node_degree = graph.degree(node)
        pair_bridge = random.choice(categories['Bridge_sybil']['nodes'])
        graph.add_edge(node, pair_bridge)
        # TODO: What about conctions between NonBridgeSybils?

    for i, node in enumerate(categories['Bridge_sybil']['nodes']):
        num_contection_to_attacker = int(
            input_data['bridge_to_attackers_con'] * categories['Attacker']['num'])
        pairs = []
        j = 0
        while j < num_contection_to_attacker:
            pair = random.choice(categories['Attacker']['nodes'])
            if pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1

    return graph, categories
