# In a real social networ, everyone is member of multiple groups.
# This test tries to simulate this condition by increasing num_joint_node

import sys
sys.path.append('../')

import algorithms
import graphs
import os
from utils import *

OUTPUT_FOLDER = './outputs/tests3/'

graph = graphs.generators.group_based.generate({
    'num_groups': 100,
    'num_seed_groups': 0,
    'min_group_nodes': 10,
    'max_group_nodes': 50,
    'max_known_ratio': 1,
    'avg_known_ratio': .5,
    'min_known_ratio': .2,
    'num_seed_nodes': 60,
    'num_attacker_to_num_honest': .1,
    'num_sybil_to_num_attacker': 1,
    'sybil_to_attackers_con': .2,
    'num_joint_node': 100,
    'num_inter_group_con': 100
})
algorithms.GroupSybilRank(graph, {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': False,
    'group_edge_weight': 2,
}).rank()
output1 = generate_output(graph)
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '1.html'))

reset_ranks(graph)
graphs.modifiers.increase_joint_nodes(graph, 3000, .2, .6)

algorithms.GroupSybilRank(graph, {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': False,
    'group_edge_weight': 2,
}).rank()
output2 = generate_output(graph)
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '2.html'))

write_output_file([output1, output2], os.path.join(OUTPUT_FOLDER, 'result.csv'))
