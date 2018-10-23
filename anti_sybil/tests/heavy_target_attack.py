import os
import sys
import random
sys.path.append('..')

import algorithms
import inconsistency
from graphs.node import Node
from utils import *
from collections import OrderedDict

OUTPUT_FOLDER = './outputs/heavy_target_attack/'

graph_params = {
    'num_seed_nodes': 30,
    'num_sybil_to_num_honest': 0,
    'sybil_con_to_honest_con': 0.5,
    'num_bridge_to_num_non_bridge': 1,
    'num_attacker_to_num_honest': 0,
    'num_sybil_to_num_attacker': 1,
    'bridge_to_attackers_con': 0.3,
    'num_honest': 47,
    'min_degree': 10,
    'max_degree': 25,
    'avg_degree': 15,
    'num_groups': 100,
    'min_group_nodes': 3,
    'max_group_nodes': 10,
    'num_joint_node': 300,
    'num_seed_groups': 5,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': .5,
    'num_inter_group_con': 300,
}

algorithm_options = {
    'accumulative': False,
    'weaken_under_min': False,
    'min_degree': 5,
    'nonlinear_distribution': True,
    'group_edge_weight': 20,
    'weaken_inconsistency_ratio': .1,
    'min_neighborhood_factor': 5,
    'min_reliable_rank': 20,
    'thresholds': [.36, .24, .18, .12, .06, .04, .02, .01, .005, .004, .003, .002, .0015, .001, .0005, 0]
}

# making a test graph and ranking nodes
graph = graphs.generators.group_based.generate(graph_params)
ranker = algorithms.SybilGroupRank(graph, algorithm_options)
ranker.rank()

# selecting TOP ranked nodes as target of attack
NUM_ATTACKERS = 5
NUM_SYBILS = 10
TOP = 30
edges = []
attackers = []
outputs = []
nodes = sorted(list(graph.nodes), key=lambda n: n.rank, reverse=True)
nodes_dic = OrderedDict([(node.name, node) for node in nodes])
# making attacker nodes
for i in range(NUM_ATTACKERS):
    nodes_dic['a-{0}'.format(i)] = Node(
        'a-{0}'.format(i), 'Attacker', groups=set(['target_attack']))
    attackers.append('a-{0}'.format(i))
# connecting attackers to top ranked nodes
for top_node in nodes[:TOP]:
    edges.append((nodes_dic[random.choice(attackers)],
                  nodes_dic[top_node.name]))
# making sybils and connecting them to attackers
for i in range(NUM_SYBILS):
    nodes_dic['s-{0}'.format(i)] = Node(
        's-{0}'.format(i), 'Sybil', groups=set(['target_attack']))
    for attacker in attackers:
        edges.append((nodes_dic['s-{0}'.format(i)], nodes_dic[attacker]))

# updating graph
graph.add_edges_from(edges)
reset_ranks(graph)
# recalculating ranks
ranker = algorithms.SybilGroupRank(graph, algorithm_options)
ranker.rank()
inconsistencies = inconsistency.calculate(ranker.graph, ranker.group_graph)
print('Group\t\tInconsistency')
for group, inconsistency_score in inconsistencies:
    print("{0} \t{1:.4f}".format(group, inconsistency_score))
outputs.append(generate_output(graph))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'nodes.html'))
draw_graph(ranker.group_graph,
           os.path.join(OUTPUT_FOLDER, 'groups.html'))
write_output_file(outputs, os.path.join(OUTPUT_FOLDER, 'result.csv'))
