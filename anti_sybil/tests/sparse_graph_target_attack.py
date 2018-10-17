import sys
sys.path.append('..')

import algorithms
from graphs.node import Node
from utils import *

OUTPUT_FOLDER = './outputs/sparse_graph_target_attack/'

graph_params = {
    'num_seed_nodes': 140,
    'num_sybil_to_num_honest': 0,
    'sybil_con_to_honest_con': 0.5,
    'num_bridge_to_num_non_bridge': 1,
    'num_attacker_to_num_honest': 0,
    'num_sybil_to_num_attacker': 2,
    'bridge_to_attackers_con': 0.3,
    'num_honest': 47,
    'min_degree': 10,
    'max_degree': 25,
    'avg_degree': 15,
    'num_groups': 50,
    'min_group_nodes': 3,
    'max_group_nodes': 25,
    'num_joint_node': 50,
    'num_seed_groups': 3,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': 1,
    'num_inter_group_con': 20
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
    'thresholds': [.36, .24, .18, .12, .06, .04, .02, .01, .005, .004, .003, .002, .001, 0]
}

sybil_edges1 = [
    [0, 's1'],
    [0, 's2'],
    [0, 's3'],
    [0, 's4'],
    [0, 's5'],
    [0, 's6'],
    [0, 's7'],
    [0, 's8'],
    ['s1', 's2'],
    ['s3', 's4'],
    ['s5', 's6'],
    ['s7', 's8']
]

sybil_edges2 = [
    [0, 's11'],
    [0, 's12'],
    [0, 's13'],
    [0, 's14'],
    [0, 's15'],
    [0, 's16'],
    [0, 's17'],
    [0, 's18'],
    ['s11', 's12'],
    ['s13', 's14'],
    ['s15', 's16'],
    ['s17', 's18']
]

sybil_edges3 = [
    [0, 's21'],
    [0, 's22'],
    [0, 's23'],
    [0, 's24'],
    [0, 's25'],
    [0, 's26'],
    [0, 's27'],
    [0, 's28'],
    # [0, 's31'],
    # [0, 's32'],
    # [0, 's33'],
    # [0, 's34'],
    # [0, 's35'],
    # [0, 's36'],
    # [0, 's37'],
    # [0, 's38'],
    ['s21', 's22'],
    ['s23', 's24'],
    ['s25', 's26'],
    ['s27', 's28'],
    # ['s31', 's32'],
    # ['s33', 's34'],
    # ['s35', 's36'],
    # ['s37', 's38'],
    # ['s21', 's32'],
    # ['s23', 's34'],
    # ['s25', 's36'],
    # ['s27', 's38'],
    # ['s31', 's22'],
    # ['s33', 's24'],
    # ['s35', 's26'],
    # ['s37', 's28'],
]

sybil_edges4 = [
    [0, 's41'],
    [0, 's42'],
    [0, 's43'],
    [0, 's44'],
    [0, 's45'],
    [0, 's46'],
    [0, 's47'],
    [0, 's48'],
    ['s41', 's42'],
    ['s43', 's44'],
    ['s45', 's46'],
    ['s47', 's48']
]

sybil_edges5 = [
    [0, 's51'],
    [0, 's52'],
    [0, 's53'],
    [0, 's54'],
    [0, 's55'],
    [0, 's56'],
    [0, 's57'],
    [0, 's58'],
    ['s51', 's52'],
    ['s53', 's54'],
    ['s55', 's56'],
    ['s57', 's58']
]

sybil_edges6 = [
    [0, 's61'],
    [0, 's62'],
    [0, 's63'],
    [0, 's64'],
    [0, 's65'],
    [0, 's66'],
    [0, 's67'],
    [0, 's68'],
    ['s61', 's62'],
    ['s63', 's64'],
    ['s65', 's66'],
    ['s67', 's68']
]

sybil_edges7 = [
    [0, 's71'],
    [0, 's72'],
    [0, 's73'],
    [0, 's74'],
    [0, 's75'],
    [0, 's76'],
    [0, 's77'],
    [0, 's78'],
    ['s71', 's72'],
    ['s73', 's74'],
    ['s75', 's76'],
    ['s77', 's78']
]

sybil_edges8 = [
    [0, 's81'],
    [0, 's82'],
    [0, 's83'],
    [0, 's84'],
    [0, 's85'],
    [0, 's86'],
    [0, 's87'],
    [0, 's88'],
    ['s81', 's82'],
    ['s83', 's84'],
    ['s85', 's86'],
    ['s87', 's88']
]

sybil_edges9 = [
    [0, 's91'],
    [0, 's92'],
    [0, 's93'],
    [0, 's94'],
    [0, 's95'],
    [0, 's96'],
    [0, 's97'],
    [0, 's98'],
    ['s91', 's92'],
    ['s93', 's94'],
    ['s95', 's96'],
    ['s97', 's98']
]

sybil_edges10 = [
    [0, 's101'],
    [0, 's102'],
    [0, 's103'],
    [0, 's104'],
    [0, 's105'],
    [0, 's106'],
    [0, 's107'],
    [0, 's108'],
    ['s101', 's102'],
    ['s103', 's104'],
    ['s105', 's106'],
    ['s107', 's108']
]


def add_sybils(graph, sybil_edges, group):
    nodes_dic = {node.name: node for node in graph.nodes()}
    edges = []
    for edge in sybil_edges:
        for node_name in edge:
            if node_name not in nodes_dic:
                nodes_dic[node_name] = Node(node_name, 'Sybil', groups=set([group]))
        edges.append((nodes_dic[edge[0]], nodes_dic[edge[1]]))
    graph.add_edges_from(edges)


graph = graphs.generators.group_based.generate(graph_params)
add_sybils(graph, sybil_edges1, 'sybil1');
add_sybils(graph, sybil_edges2, 'sybil2');
add_sybils(graph, sybil_edges3, 'sybil3');
add_sybils(graph, sybil_edges4, 'sybil4');
add_sybils(graph, sybil_edges5, 'sybil5');
# add_sybils(graph, sybil_edges6, 'sybil6');
# add_sybils(graph, sybil_edges7, 'sybil7');
# add_sybils(graph, sybil_edges8, 'sybil8');
# add_sybils(graph, sybil_edges9, 'sybil9');
# add_sybils(graph, sybil_edges10, 'sybil10');

outputs = []

ranker = algorithms.SybilGroupRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SybilGroupRank.html'))

reset_ranks(graph)

ranker = algorithms.SybilRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SybilRank.html'))

reset_ranks(graph)

ranker = algorithms.GroupSybilRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'GroupSybilRank.html'))

reset_ranks(graph)

ranker = algorithms.GroupMergingRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'GroupMerge.html'))

write_output_file(outputs, os.path.join(OUTPUT_FOLDER, 'result.csv'))
