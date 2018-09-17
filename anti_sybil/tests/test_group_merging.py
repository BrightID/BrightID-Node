from algorithms.group_merging import GroupMergingRank
import graphs
import os
from utils import *

OUTPUT_FOLDER = './outputs/tests_group_merging/'

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
    'num_joint_node': 50,
    'num_inter_group_con': 100
})

GroupMergingRank(graph, {
    "thresholds": [0.8, 0.5, 0.3, 0.1, 0.05, 0]
}).rank()

for node in graph:
    print node.name, node.rank, node.node_type, [g for g in node.groups]
