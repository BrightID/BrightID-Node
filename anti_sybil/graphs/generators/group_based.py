import random

import networkx as nx

from ..node import Node


def generate(input_data):
    graph = nx.Graph()
    groups_size = [random.choice(range(input_data['min_group_nodes'], input_data['max_group_nodes']+1))
                   for i in range(input_data['num_groups'])]
    num_attacker = int(sum(groups_size) *
                       input_data['num_attacker_to_num_honest'])
    num_sybil = int(input_data['num_sybil_to_num_attacker'] * num_attacker)
    categories = {
        'Seed': {'nodes': [], 'num': input_data['num_seed_nodes']},
        'Honest': {'nodes': [], 'num': sum(groups_size) - input_data['num_seed_nodes'] - num_attacker},
        'Attacker': {'nodes': [], 'num': num_attacker},
        'Sybil': {'nodes': [], 'num': num_sybil},
    }
    start_node = input_data.get('start_node', 0)
    counter = start_node
    for category in categories:
        for i in range(categories[category]['num']):
            node = Node(counter, category)
            categories[category]['nodes'].append(node)
            graph.add_node(node)
            counter += 1
    non_sybils = categories['Honest']['nodes'] + \
        categories['Seed']['nodes'] + categories['Attacker']['nodes']
    random.shuffle(non_sybils)
    for group_num, size in enumerate(groups_size):
        group_name = 'group_{0}'.format(group_num)
        start_point = sum(groups_size[:group_num])
        end_point = start_point + size
        groups_nodes = non_sybils[start_point:end_point]
        for node in groups_nodes:
            node.groups.add(group_name)
    
    groups = set(sum([list(node.groups) for node in non_sybils], []))
    i = 0
    while i < input_data['num_joint_node']:
        joint_node = random.choice(non_sybils)
        other_groups = groups - joint_node.groups
        if len(other_groups) > 0:
            random_group = random.choice(list(other_groups))
            joint_node.groups.add(random_group)
            i += 1

    if input_data['num_seed_groups'] != 0:
        seed_groups = ['seed_group_{0}'.format(i) for i in range(input_data['num_seed_groups'])]
        for node in categories['Seed']['nodes']:
            node.groups.add(random.choice(seed_groups))

    for group in groups:
        nodes = [node for node in non_sybils if group in node.groups]
        nodes_degree = dict((node, 0) for node in nodes)
        min_degree = int(input_data['min_known_ratio'] * len(nodes))
        avg_degree = int(input_data['avg_known_ratio'] * len(nodes))
        max_degree = min(
            int(input_data['max_known_ratio'] * len(nodes)), len(nodes) - 1)
        low_degrees = range(min_degree, avg_degree) if min_degree != avg_degree else [min_degree]
        up_degrees = range(avg_degree, max_degree + 1)
        for i, node in enumerate(nodes):
            group_degree = sum(nodes_degree.values()) / (i+1)
            if group_degree < avg_degree:
                degree = random.choice(up_degrees)
            else:
                degree = random.choice(low_degrees)
            j = counter = 0
            pairs = []
            while j < degree:
                pair = random.choice(nodes)
                if node != pair and nodes_degree[pair] <= max_degree and pair not in pairs:
                    graph.add_edge(node, pair)
                    pairs.append(pair)
                    j += 1
                    nodes_degree[node] += 1
                else:
                    counter += 1
                    if counter > 100*degree:
                        # j += 1
                        raise Exception(
                            "Can't find pair. group_degree={}".format(group_degree))
    num_connection_to_attacker = max(
        int(input_data['sybil_to_attackers_con'] * categories['Attacker']['num']), 1)
    for i, node in enumerate(categories['Sybil']['nodes']):
        pairs = []
        j = 0
        while j < num_connection_to_attacker:
            pair = random.choice(categories['Attacker']['nodes'])
            if pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1

    for node in categories['Attacker']['nodes'] + categories['Sybil']['nodes']:
        node.groups.add('attacker')

    # Add inter-group connections
    i = 0
    inter_group_pairs = []
    while i < input_data['num_inter_group_con']:
        node = random.choice(non_sybils)
        pair = random.choice(non_sybils)
        if len(node.groups & pair.groups) == 0 and (node, pair) not in inter_group_pairs:
            graph.add_edge(node, pair)
            inter_group_pairs.append((node, pair))
            i += 1
    # sew graph parts together
    if not nx.is_connected(graph):
        components = list(nx.connected_components(graph))
        biggest_comp = []
        for i, component in enumerate(components):
            if len(component) > len(biggest_comp):
                biggest_comp = list(component)
        for component in components:
            if component == biggest_comp:
                continue
            non_sybils = False
            i = 0
            while not non_sybils:
                i += 1
                left_node = random.choice(list(component))
                right_node = random.choice(biggest_comp)
                if left_node.node_type != 'Sybil' and right_node.node_type != 'Sybil':
                    graph.add_edge(left_node, right_node)
                    print(
                        'Add Edge: {0} --> {1}'.format(left_node, right_node))
                    non_sybils = True
                if i > len(biggest_comp):
                    print(['%s %s'%(node.name, node.node_type) for node in component])
                    raise("Can't sew above component to the biggest_comp")
    return graph
