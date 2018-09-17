# Test if GroupSybilRank works better than SybilRank

import os
import copy
import algorithms
import graphs
from utils import *

OUTPUT_FOLDER = './outputs/tests2/'
main_graph_params = {
    'num_groups': 50,
    'num_seed_groups': 0,
    'min_group_nodes': 5,
    'max_group_nodes': 15,
    'max_known_ratio': 1,
    'avg_known_ratio': .5,
    'min_known_ratio': .2,
    'num_seed_nodes': 25,
    'num_attacker_to_num_honest': .1,
    'num_sybil_to_num_attacker': 1,
    'sybil_to_attackers_con': .2,
    'num_joint_node': 500,
    'num_inter_group_con': 500
}
algorithm_params = {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': True,
    'nonlinear_distribution': True,
    'group_edge_weight': 2,
}

graph_params = copy.copy(main_graph_params)
graph = graphs.generators.group_based.generate(graph_params)
algorithms.GroupSybilRank(graph, algorithm_params).rank()
output1 = generate_output(graph)
reset_ranks(graph)
algorithms.SybilRank(graph, algorithm_params).rank()
output2 = generate_output(graph)
reset_ranks(graph)

graph_params = copy.copy(main_graph_params)
graph_params['num_joint_node'] = 50
graph_params['num_inter_group_con'] = 50
graph = graphs.generators.group_based.generate(graph_params)
algorithms.GroupSybilRank(graph, algorithm_params).rank()
output3 = generate_output(graph)
reset_ranks(graph)
algorithms.SybilRank(graph, algorithm_params).rank()
output4 = generate_output(graph)
reset_ranks(graph)

graph_params = copy.copy(main_graph_params)
graph_params['num_seed_nodes'] = 100
graph = graphs.generators.group_based.generate(graph_params)
algorithms.GroupSybilRank(graph, algorithm_params).rank()
output5 = generate_output(graph)
reset_ranks(graph)
algorithms.SybilRank(graph, algorithm_params).rank()
output6 = generate_output(graph)
reset_ranks(graph)

graph_params = copy.copy(main_graph_params)
graph_params['sybil_to_attackers_con'] = .7
graph = graphs.generators.group_based.generate(graph_params)
algorithms.GroupSybilRank(graph, algorithm_params).rank()
output7 = generate_output(graph)
reset_ranks(graph)
algorithms.SybilRank(graph, algorithm_params).rank()
output8 = generate_output(graph)
reset_ranks(graph)

graph_params = copy.copy(main_graph_params)
graph_params['num_seed_groups'] = 5
graph = graphs.generators.group_based.generate(graph_params)
algorithms.GroupSybilRank(graph, algorithm_params).rank()
output9 = generate_output(graph)
reset_ranks(graph)
algorithms.SybilRank(graph, algorithm_params).rank()
output10 = generate_output(graph)
reset_ranks(graph)

write_output_file([output1, output2, output3, output4, output5, output6, output7, output8, output9, output10], os.path.join(OUTPUT_FOLDER, 'result.csv'))
