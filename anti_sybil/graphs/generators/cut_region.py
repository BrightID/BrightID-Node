import networkx as nx
import random
from ..node import Node


def generate(input_data):
    num_attacker = int(
        input_data['num_attacker_to_num_honest'] * input_data['num_honest'])
    num_sybil = int(input_data['num_sybil_to_num_attacker'] * num_attacker)
    num_bridge_sybil = int(
        input_data['num_bridge_to_num_non_bridge'] * num_sybil)
    num_non_bridge_sybil = num_sybil - num_bridge_sybil
    categories = {
        'Seed': {'nodes': [], 'num': input_data['num_seed_nodes']},
        'Honest': {'nodes': [], 'num': input_data['num_honest'] - input_data['num_seed_nodes']},
        'Attacker': {'nodes': [], 'num': num_attacker},
        'Bridge Sybil': {'nodes': [], 'num': num_bridge_sybil},
        'Non Bridge Sybil': {'nodes': [], 'num': num_non_bridge_sybil}
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
    non_sybils = categories['Honest']['nodes'] + \
        categories['Attacker']['nodes'] + categories['Seed']['nodes']
    for i, node in enumerate(non_sybils):
        node_degree = graph.degree(node)
        peresent_graph_degree = sum(
            degree for node, degree in graph.degree()) / (i + 1)
        if peresent_graph_degree < input_data['avg_degree']:
            degree = random.choice(up_degrees)
        else:
            degree = random.choice(low_degrees)
        j = counter = 0
        pairs = []
        while j < degree:
            pair = random.choice(non_sybils)
            if node != pair and graph.degree(pair) < input_data['max_degree'] and pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1
            else:
                counter += 1
                if counter > 10*degree:
                    raise Exception("Can't find pair. peresent_graph_degree={}".format(peresent_graph_degree))

    if categories['Non Bridge Sybil']['num'] != 0:
        for i, node in enumerate(categories['Non Bridge Sybil']['nodes']):
            node_degree = graph.degree(node)
            pair_bridge = random.choice(categories['Bridge Sybil']['nodes'])
            graph.add_edge(node, pair_bridge)
            # TODO: What about conctions between NonBridgeSybils?

    for i, node in enumerate(categories['Bridge Sybil']['nodes']):
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

    return graph
