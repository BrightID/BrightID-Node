import networkx as nx
import random
from ..node import Node

def generate(input_data):
    graph = nx.Graph()
    nodes_dic = {}
    edges = []
    attackers = []
    p_seed = input_data['num_seed_to_num_honest']
    p_attacker = input_data['num_attacker_to_num_honest']
    p_honest = 1.0 - (p_seed + p_attacker)
    input_file = open(input_data['file_path'], 'rb')
    for i, row in enumerate(input_file):
        if i in (0, 1):
            continue
        edge = row.strip().split()
        for node_name in edge:
            if node_name not in nodes_dic:
                node_type = random.choice(['Honest', 'Seed', 'Attacker'], p=[p_honest, p_seed, p_attacker])
                nodes_dic[node_name] = Node(node_name, node_type)
                if node_type == 'Attacker':
                    attackers.append(nodes_dic[node_name])
        edges.append((nodes_dic[edge[0]], nodes_dic[edge[1]]))
    graph.add_edges_from(edges)
    # Add sybil nodes to the graph
    num_nodes = nx.number_of_nodes(graph)
    num_sybil = int(len(attackers) * input_data['num_sybil_to_num_attacker'])
    num_connection_to_attacker = max(
        int(input_data['sybil_to_attackers_con'] * len(attackers)), 1)
    sybil_nodes = []
    sybil_nodes_con = []
    for i in range(num_sybil):
        node = Node(num_nodes + i + 1, 'Sybil')
        sybil_nodes.append(node)
        pairs = random.sample(attackers, num_connection_to_attacker)
        sybil_nodes_con.extend([(node, pair) for pair in pairs])
    graph.add_edges_from(sybil_nodes_con)
    return graph
