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
    'thresholds': [.36, .24, .18, .12, .06, .04, .02, .01, .005, .004, .003, .002, .001, 0]
}

sybil_edges1 = [
    [110, 's1'],
    [110, 's2'],
    [110, 's3'],
    [110, 's4'],
    [110, 's5'],
    [110, 's6'],
    [110, 's7'],
    [110, 's8'],
    ['s1', 's2'],
    ['s3', 's4'],
    ['s5', 's6'],
    ['s7', 's8']
]

sybil_edges2 = [
    [110, 's11'],
    [110, 's12'],
    [110, 's13'],
    [110, 's14'],
    [110, 's15'],
    [110, 's16'],
    [110, 's17'],
    [110, 's18'],
    ['s11', 's12'],
    ['s13', 's14'],
    ['s15', 's16'],
    ['s17', 's18']
]

sybil_edges3 = [
    [110, 's21'],
    [110, 's22'],
    [110, 's23'],
    [110, 's24'],
    [110, 's25'],
    [110, 's26'],
    [110, 's27'],
    [110, 's28'],
    # [110, 's31'],
    # [110, 's32'],
    # [110, 's33'],
    # [110, 's34'],
    # [110, 's35'],
    # [110, 's36'],
    # [110, 's37'],
    # [110, 's38'],
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
    [110, 's41'],
    [110, 's42'],
    [110, 's43'],
    [110, 's44'],
    [110, 's45'],
    [110, 's46'],
    [110, 's47'],
    [110, 's48'],
    ['s41', 's42'],
    ['s43', 's44'],
    ['s45', 's46'],
    ['s47', 's48']
]

sybil_edges5 = [
    [110, 's51'],
    [110, 's52'],
    [110, 's53'],
    [110, 's54'],
    [110, 's55'],
    [110, 's56'],
    [110, 's57'],
    [110, 's58'],
    ['s51', 's52'],
    ['s53', 's54'],
    ['s55', 's56'],
    ['s57', 's58']
]

sybil_edges6 = [
    [110, 's61'],
    [110, 's62'],
    [110, 's63'],
    [110, 's64'],
    [110, 's65'],
    [110, 's66'],
    [110, 's67'],
    [110, 's68'],
    ['s61', 's62'],
    ['s63', 's64'],
    ['s65', 's66'],
    ['s67', 's68']
]

sybil_edges7 = [
    [110, 's71'],
    [110, 's72'],
    [110, 's73'],
    [110, 's74'],
    [110, 's75'],
    [110, 's76'],
    [110, 's77'],
    [110, 's78'],
    ['s71', 's72'],
    ['s73', 's74'],
    ['s75', 's76'],
    ['s77', 's78']
]

sybil_edges8 = [
    [110, 's81'],
    [110, 's82'],
    [110, 's83'],
    [110, 's84'],
    [110, 's85'],
    [110, 's86'],
    [110, 's87'],
    [110, 's88'],
    ['s81', 's82'],
    ['s83', 's84'],
    ['s85', 's86'],
    ['s87', 's88']
]

sybil_edges9 = [
    [110, 's91'],
    [110, 's92'],
    [110, 's93'],
    [110, 's94'],
    [110, 's95'],
    [110, 's96'],
    [110, 's97'],
    [110, 's98'],
    ['s91', 's92'],
    ['s93', 's94'],
    ['s95', 's96'],
    ['s97', 's98']
]

sybil_edges10 = [
    [110, 's101'],
    [110, 's102'],
    [110, 's103'],
    [110, 's104'],
    [110, 's105'],
    [110, 's106'],
    [110, 's107'],
    [110, 's108'],
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