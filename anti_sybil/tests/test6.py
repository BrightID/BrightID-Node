# test effect of running sybil rank on graph of groups instead of graph of individuals

import algorithms
import graphs
import os
import copy
from utils import *

OUTPUT_FOLDER = './outputs/tests6/'

algorithm_options = {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': False,
    'nonlinear_distribution': True,
    'group_edge_weight': 2
}
main_graph_params = {
    'num_groups': 100,
    'num_seed_groups': 5,
    'min_group_nodes': 5,
    'max_group_nodes': 15,
    'max_known_ratio': 1,
    'avg_known_ratio': .5,
    'min_known_ratio': .2,
    'num_seed_nodes': 30,
    'num_attacker_to_num_honest': .1 ,
    'num_sybil_to_num_attacker': 2,
    'sybil_to_attackers_con': .1,
    'num_joint_node': 100,
    'num_inter_group_con': 100
}


def test(graph_params):

    graph = graphs.generators.group_based.generate(graph_params)
    group_graph = algorithms.SybilGroupRank(graph, algorithm_options).rank()
    output1 = generate_output(graph)

    reset_ranks(graph)
    group_graph = algorithms.SybilRank(graph, algorithm_options).rank()
    output2 = generate_output(graph)

    reset_ranks(graph)
    group_graph = algorithms.GroupSybilRank(graph, algorithm_options).rank()
    output3 = generate_output(graph)
    return [output1, output2, output3]

if __name__ == '__main__':
    outputs = []
    graph_params = copy.copy(main_graph_params)
    outputs.extend(test(graph_params))

    graph_params = copy.copy(main_graph_params)
    graph_params['sybil_to_attackers_con'] = .7
    outputs.extend(test(graph_params))

    graph_params = copy.copy(main_graph_params)
    graph_params['num_groups'] = 30
    graph_params['min_group_nodes'] = 30
    graph_params['max_group_nodes'] = 70
    outputs.extend(test(graph_params))

    graph_params = copy.copy(main_graph_params)
    graph_params['num_joint_node'] = 3000
    graph_params['num_inter_group_con'] = 3000
    outputs.extend(test(graph_params))
    
    write_output_file(outputs, os.path.join(OUTPUT_FOLDER, 'result.csv'))
