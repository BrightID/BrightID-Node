import algorithms
import graphs
import os
from utils import *

OUTPUT_FOLDER = './outputs/tests1/'

graph = graphs.generators.group_based.generate({
    'num_groups': 5,
    'num_seed_groups': 2,
    'min_group_nodes': 20,
    'max_group_nodes': 50,
    'max_known_ratio': 1,
    'avg_known_ratio': .5,
    'min_known_ratio': .2,
    'num_seed_nodes': 20,
    'num_attacker_to_num_honest': .1,
    'num_sybil_to_num_attacker': 5,
    'sybil_to_attackers_con': .5,
    'num_joint_node': 10,
    'num_inter_group_con': 20
})
algorithms.GroupSybilRank(graph, {
    'min_degree': 2,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': False,
    'group_edge_weight': 2,
}).rank()
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '1.html'))
output1 = generate_output(graph)

reset_ranks(graph)
graphs.modifiers.nodes.remove_weak_attackers(graph, .7)

algorithms.GroupSybilRank(graph, {
    'min_degree': 2,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': False,
    'group_edge_weight': 2,
}).rank()
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '2.html'))
output2 = generate_output(graph)

write_output_file([output1, output2], os.path.join(OUTPUT_FOLDER, 'result.csv'))
