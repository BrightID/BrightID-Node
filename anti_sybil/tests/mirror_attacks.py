import sys
sys.path.append('..')

import algorithms
from graphs.node import Node
from utils import *

OUTPUT_FOLDER = './outputs/mirror_attacks/'

graph_params_1 = {
    'num_seed_nodes': 36,
    'num_attacker_to_num_honest': 0.0,
    'num_sybil_to_num_attacker': 2,
    'num_groups': 38,
    'min_group_nodes': 3,
    'max_group_nodes': 33,
    'num_joint_node': 72,
    'num_seed_groups': 2,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': 1,
    'num_inter_group_con': 720
}

graph_params_2 = {
    'start_node': 1000,
    'num_seed_nodes': 18,
    'num_attacker_to_num_honest': 0.0,
    'num_sybil_to_num_attacker': 2,
    'num_groups': 19,
    'min_group_nodes': 3,
    'max_group_nodes': 33,
    'num_joint_node': 360,
    'num_seed_groups': 1,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': .5,
    'num_inter_group_con': 360
}

graph_params_3 = {
    'start_node': 2000,
    'num_seed_nodes': 18,
    'num_attacker_to_num_honest': 0.10,
    'num_sybil_to_num_attacker': 2,
    'num_groups': 19,
    'min_group_nodes': 3,
    'max_group_nodes': 33,
    'num_joint_node': 36,
    'num_seed_groups': 1,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': 1,
    'num_inter_group_con': 360
}

algorithm_options = {
    'accumulative': False,
    'nonlinear_distribution': True,
    'group_edge_weight': 20,
    'thresholds': [.36, .24, .22, .21, .20, .19, .18, .17, .16, .15, .14, .13, .12, .11, .10, .09, .08, .07, .06, .055, .05, .045, .04, .02, .01, .005, .004, .003, .002, .0015, .001, .0005, 0],
}

graph_1 = graphs.generators.group_based.generate(graph_params_1)
graphs.generators.seed_mirror.mirror(graph_1)

# graph_2 = graphs.generators.group_based.generate(graph_params_2)
# graph_3 = graphs.generators.group_based.generate(graph_params_3)

# graph = nx.compose(graph_1, graph_2)
# graph = nx.compose(graph, graph_3)

outputs = []

ranker = algorithms.SybilRank(graph_1, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph_1, 'SybilRank_sparse_mirror'))
draw_graph(graph_1, os.path.join(OUTPUT_FOLDER, 'SybilRank_sparse_mirror.html'))

reset_ranks(graph_1)

ranker = algorithms.SybilGroupRank(graph_1, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph_1, 'SybilGroupRank_sparse_mirror'))
draw_graph(graph_1, os.path.join(OUTPUT_FOLDER, 'SybilGroupRank_sparse_mirror.html'))

reset_ranks(graph_1)

ranker = algorithms.GroupSybilRank(graph_1, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph_1, 'IntraGroupWeight_sparse_mirror'))
draw_graph(graph_1, os.path.join(OUTPUT_FOLDER, 'IntraGroupWeight_sparse_mirror.html'))
#
# reset_ranks(graph_1)
#
# ranker = algorithms.GroupMergingRank(graph_1, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph_1, 'GroupMerge_sparse_mirror'))
# draw_graph(graph_1, os.path.join(OUTPUT_FOLDER, 'GroupMerge_sparse_mirror.html'))

write_output_file(outputs, os.path.join(OUTPUT_FOLDER, 'result.csv'))
