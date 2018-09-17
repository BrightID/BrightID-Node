# test effect of running sybil rank on graph of groups instead of graph of individuals

import algorithms
import graphs
import os
from utils import *

OUTPUT_FOLDER = './outputs/tests6/'

graph = graphs.generators.group_based.generate({
    'num_groups': 50,
    'num_seed_groups': 10,
    'min_group_nodes': 5,
    'max_group_nodes': 15,
    'max_known_ratio': 1,
    'avg_known_ratio': .5,
    'min_known_ratio': .2,
    'num_seed_nodes': 50,
    'num_attacker_to_num_honest': .1 ,
    'num_sybil_to_num_attacker': 1,
    'sybil_to_attackers_con': .1,
    'num_joint_node': 500,
    'num_inter_group_con': 500
})
group_graph = algorithms.SybilGroupRank(graph, {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': False,
}).rank()
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '1.html'))
draw_graph(group_graph, os.path.join(OUTPUT_FOLDER, 'group.html'))
output1 = generate_output(graph)
reset_ranks(graph)

group_graph = algorithms.SybilRank(graph, {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': False,
}).rank()
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '2.html'))
output2 = generate_output(graph)

write_output_file([output1, output2], os.path.join(OUTPUT_FOLDER, 'result.csv'))
