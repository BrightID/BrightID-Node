import networkx as nx
import collections
import random


class Node():
    def __init__(self, name, node_type, rank=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank
        self.groups = set()

    def __repr__(self):
        return str(self.name)


def init(input_data):
    graph = nx.Graph()
    groups_size = random.sample(range(
        input_data['min_group_nodes'], input_data['max_group_nodes']+1), input_data['num_groups'])
    num_attacker = int(sum(groups_size) *
                       input_data['num_attacker_to_num_honest'])
    num_sybil = int(input_data['num_sybil_to_num_attacker'] * num_attacker)
    categories = {
        'Seed': {'nodes': [], 'color': 'green', 'num': input_data['num_seed_nodes']},
        'Honest': {'nodes': [], 'color': 'blue', 'num': sum(groups_size) - input_data['num_seed_nodes'] - num_attacker},
        'Attacker': {'nodes': [], 'color': 'black', 'num': num_attacker},
        'Sybil': {'nodes': [], 'color': 'orange', 'num': num_sybil},
    }
    counter = 0
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
    joint_nodes = random.sample(non_sybils, input_data['num_joint_node'])
    groups = set(sum([list(node.groups) for node in non_sybils], []))
    for joint_node in joint_nodes:
        other_groups = groups - joint_node.groups
        if len(other_groups) > 0:
            random_group = random.choice(list(other_groups))
            joint_node.groups.add(random_group)
    for group in groups:
        nodes = [node for node in non_sybils if group in node.groups]
        nodes_degree = dict((node, 0) for node in nodes)
        min_degree = int(input_data['min_known_ratio'] * len(nodes))
        avg_degree = int(input_data['avg_known_ratio'] * len(nodes))
        max_degree = min(int(input_data['max_known_ratio'] * len(nodes)), len(nodes) - 1)
        low_degrees = range(min_degree, avg_degree)
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
    num_contection_to_attacker = max(
        int(input_data['sybil_to_attackers_con'] * categories['Attacker']['num']), 1)
    for i, node in enumerate(categories['Sybil']['nodes']):
        pairs = []
        j = 0
        while j < num_contection_to_attacker:
            pair = random.choice(categories['Attacker']['nodes'])
            if pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1
    for node in categories['Attacker']['nodes'] + categories['Sybil']['nodes']:
        node.groups.add('sybil')
    # Add iner-group connections
    inter_group_nodes = random.sample(non_sybils, input_data['num_inter_group_con'])
    inter_group_pairs = []
    for node in inter_group_nodes:
        con = False
        while not con:
            pair = random.choice(non_sybils)
            if len(node.groups & pair.groups) == 0 and (node, pair) not in inter_group_pairs:                    
                graph.add_edge(node, pair)
                inter_group_pairs.append((node, pair))
                con = True
    # sew graph parts together
    if not nx.is_connected(graph):
        components = [nx.connected_components(graph)]
        biggest_comp = []
        for i, component in enumerate(components):
            if len(component) > len(biggest_comp):
                biggest_comp = list(component)
        for component in components:
            if component == biggest_comp:
                continue
            non_sybils = False
            while not non_sybils:
                left_node = random.choice(list(component))
                right_node = random.choice(biggest_comp)
                if left_node.node_type == 'Honest' and right_node.node_type == 'Honest':
                    graph.add_edge(left_node, right_node)
                    print('Add Edge: {0} --> {1}'.format(left_node, right_node))
                    non_sybils = True
    
    return graph, categories
