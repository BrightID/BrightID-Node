import networkx as nx
import collections
import random
from ..node import Node

def generate(input_data):
    num_sybil = int(input_data['num_sybil_to_num_honest']
                    * input_data['num_honest'])
    num_honest = input_data['num_honest'] - input_data['num_seed_nodes']
    categories = {
        'Seed': {'nodes': [], 'num': input_data['num_seed_nodes']},
        'Honest': {'nodes': [], 'num': num_honest},
        'Sybil': {'nodes': [], 'num': num_sybil},
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
    honest_nodes = categories['Honest']['nodes'] + categories['Seed']['nodes']
    for i, node in enumerate(honest_nodes):
        node_degree = graph.degree(node)
        peresent_graph_degree = sum(
            degree for node, degree in graph.degree()) / (i + 1)
        if peresent_graph_degree < input_data['avg_degree']:
            degree = random.choice(up_degrees)
        else:
            degree = random.choice(low_degree)
        j = counter = 0
        pairs = []
        while j < degree:
            pair = random.choice(honest_nodes)
            if node != pair and graph.degree(pair) < input_data['max_degree'] and pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1
            else:
                counter += 1
                if counter > 10 * degree:
                    raise Exception("Can't find pair. peresent_graph_degree={}".format(
                        peresent_graph_degree))
    num_sybil_con = input_data['sybil_con_to_honest_con'] * \
        input_data['avg_degree']
    for i, node in enumerate(categories['Sybil']['nodes']):
        j = 0
        pairs = []
        while j < num_sybil_con:
            pair = random.choice(categories['Honest']['nodes'])
            if pair not in pairs:
                graph.add_edge(node, pair)
                j += 1
        # TODO: What about conctions between NonBridgeSybils?
    return graph
