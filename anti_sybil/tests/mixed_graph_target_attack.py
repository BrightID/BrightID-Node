import sys
sys.path.append('..')

import algorithms
from graphs.node import Node
from utils import *

OUTPUT_FOLDER = './outputs/mixed_graph_target_attack/'

graph_params_1 = {
    'num_seed_nodes': 14,
    'num_attacker_to_num_honest': 0.05,
    'num_sybil_to_num_attacker': 2,
    'num_groups': 19,
    'min_group_nodes': 3,
    'max_group_nodes': 25,
    'num_joint_node': 20,
    'num_seed_groups': 1,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': 1,
    'num_inter_group_con': 210
}

graph_params_2 = {
    'start_node': 1000,
    'num_seed_nodes': 14,
    'num_attacker_to_num_honest': 0.05,
    'num_sybil_to_num_attacker': 2,
    'num_groups': 19,
    'min_group_nodes': 3,
    'max_group_nodes': 25,
    'num_joint_node': 200,
    'num_seed_groups': 1,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': 1,
    'num_inter_group_con': 210
}

algorithm_options = {
    'accumulative': False,
    'weaken_under_min': True,
    'min_degree': 14,
    'weaken_seed': 0,
    'nonlinear_distribution': True,
    'group_edge_weight': 20,
    'thresholds': [.36, .24, .18, .12, .06, .04, .02, .01, .005, .004, .003, .002, .0015, .001, .0005, 0]
}

sybil_edges1 = [
    [16, 's1'],
    [16, 's2'],
    [16, 's3'],
    [16, 's4'],
    [16, 's5'],
    [16, 's6'],
    [16, 's7'],
    [16, 's8'],
    [17, 's1'],
    [17, 's2'],
    [17, 's3'],
    [17, 's4'],
    [17, 's5'],
    [17, 's6'],
    [17, 's7'],
    [17, 's8'],
    [18, 's1'],
    [18, 's2'],
    [18, 's3'],
    [18, 's4'],
    [18, 's5'],
    [18, 's6'],
    [18, 's7'],
    [18, 's8'],
    [19, 's1'],
    [19, 's2'],
    [19, 's3'],
    [19, 's4'],
    [19, 's5'],
    [19, 's6'],
    [19, 's7'],
    [19, 's8'],
    [21, 's1'],
    [21, 's2'],
    [21, 's3'],
    [21, 's4'],
    [21, 's5'],
    [21, 's6'],
    [21, 's7'],
    [21, 's8'],
    [22, 's1'],
    [22, 's2'],
    [22, 's3'],
    [22, 's4'],
    [22, 's5'],
    [22, 's6'],
    [22, 's7'],
    [22, 's8'],
    # [3, 's1'],
    # [3, 's2'],
    # [3, 's3'],
    # [3, 's4'],
    # [3, 's5'],
    # [3, 's6'],
    # [3, 's7'],
    # [3, 's8'],
    # [4, 's1'],
    # [4, 's2'],
    # [4, 's3'],
    # [4, 's4'],
    # [4, 's5'],
    # [4, 's6'],
    # [4, 's7'],
    # [4, 's8'],
    # [5, 's1'],
    # [5, 's2'],
    # [5, 's3'],
    # [5, 's4'],
    # [5, 's5'],
    # [5, 's6'],
    # [5, 's7'],
    # [5, 's8'],
    ['s1', 's2'],
    ['s3', 's4'],
    ['s5', 's6'],
    ['s7', 's8']
]

sybil_edges1b = [
    [1016, 'sb1'],
    [1016, 'sb2'],
    [1016, 'sb3'],
    [1016, 'sb4'],
    [1016, 'sb5'],
    [1016, 'sb6'],
    [1016, 'sb7'],
    [1016, 'sb8'],
    [1017, 'sb1'],
    [1017, 'sb2'],
    [1017, 'sb3'],
    [1017, 'sb4'],
    [1017, 'sb5'],
    [1017, 'sb6'],
    [1017, 'sb7'],
    [1017, 'sb8'],
    [1018, 'sb1'],
    [1018, 'sb2'],
    [1018, 'sb3'],
    [1018, 'sb4'],
    [1018, 'sb5'],
    [1018, 'sb6'],
    [1018, 'sb7'],
    [1018, 'sb8'],
    [1019, 'sb1'],
    [1019, 'sb2'],
    [1019, 'sb3'],
    [1019, 'sb4'],
    [1019, 'sb5'],
    [1019, 'sb6'],
    [1019, 'sb7'],
    [1019, 'sb8'],
    [1021, 'sb1'],
    [1021, 'sb2'],
    [1021, 'sb3'],
    [1021, 'sb4'],
    [1021, 'sb5'],
    [1021, 'sb6'],
    [1021, 'sb7'],
    [1021, 'sb8'],
    [1022, 'sb1'],
    [1022, 'sb2'],
    [1022, 'sb3'],
    [1022, 'sb4'],
    [1022, 'sb5'],
    [1022, 'sb6'],
    [1022, 'sb7'],
    [1022, 'sb8'],
    # [3, 'sb1'],
    # [3, 'sb2'],
    # [3, 'sb3'],
    # [3, 'sb4'],
    # [3, 'sb5'],
    # [3, 'sb6'],
    # [3, 'sb7'],
    # [3, 'sb8'],
    # [4, 'sb1'],
    # [4, 'sb2'],
    # [4, 'sb3'],
    # [4, 'sb4'],
    # [4, 'sb5'],
    # [4, 'sb6'],
    # [4, 'sb7'],
    # [4, 'sb8'],
    # [5, 'sb1'],
    # [5, 'sb2'],
    # [5, 'sb3'],
    # [5, 'sb4'],
    # [5, 'sb5'],
    # [5, 'sb6'],
    # [5, 'sb7'],
    # [5, 'sb8'],
    ['sb1', 'sb2'],
    ['sb3', 'sb4'],
    ['sb5', 'sb6'],
    ['sb7', 'sb8']
]


sybil_edges2 = [
    [16, 's11'],
    [16, 's12'],
    [16, 's13'],
    [16, 's14'],
    [16, 's15'],
    [16, 's16'],
    [16, 's17'],
    [16, 's18'],
    ['s11', 's12'],
    ['s13', 's14'],
    ['s15', 's16'],
    ['s17', 's18']
]

sybil_edges3 = [
    [16, 's21'],
    [16, 's22'],
    [16, 's23'],
    [16, 's24'],
    [16, 's25'],
    [16, 's26'],
    [16, 's27'],
    [16, 's28'],
    # [6, 's31'],
    # [6, 's32'],
    # [6, 's33'],
    # [6, 's34'],
    # [6, 's35'],
    # [6, 's36'],
    # [6, 's37'],
    # [6, 's38'],
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
    [16, 's41'],
    [16, 's42'],
    [16, 's43'],
    [16, 's44'],
    [16, 's45'],
    [16, 's46'],
    [16, 's47'],
    [16, 's48'],
    ['s41', 's42'],
    ['s43', 's44'],
    ['s45', 's46'],
    ['s47', 's48']
]

sybil_edges5 = [
    [16, 's51'],
    [16, 's52'],
    [16, 's53'],
    [16, 's54'],
    [16, 's55'],
    [16, 's56'],
    [16, 's57'],
    [16, 's58'],
    ['s51', 's52'],
    ['s53', 's54'],
    ['s55', 's56'],
    ['s57', 's58']
]

sybil_edges6 = [
    [16, 's61'],
    [16, 's62'],
    [16, 's63'],
    [16, 's64'],
    [16, 's65'],
    [16, 's66'],
    [16, 's67'],
    [16, 's68'],
    ['s61', 's62'],
    ['s63', 's64'],
    ['s65', 's66'],
    ['s67', 's68']
]

sybil_edges7 = [
    [16, 's71'],
    [16, 's72'],
    [16, 's73'],
    [16, 's74'],
    [16, 's75'],
    [16, 's76'],
    [16, 's77'],
    [16, 's78'],
    ['s71', 's72'],
    ['s73', 's74'],
    ['s75', 's76'],
    ['s77', 's78']
]

sybil_edges8 = [
    [16, 's81'],
    [16, 's82'],
    [16, 's83'],
    [16, 's84'],
    [16, 's85'],
    [16, 's86'],
    [16, 's87'],
    [16, 's88'],
    ['s81', 's82'],
    ['s83', 's84'],
    ['s85', 's86'],
    ['s87', 's88']
]

sybil_edges9 = [
    [16, 's91'],
    [16, 's92'],
    [16, 's93'],
    [16, 's94'],
    [16, 's95'],
    [16, 's96'],
    [16, 's97'],
    [16, 's98'],
    ['s91', 's92'],
    ['s93', 's94'],
    ['s95', 's96'],
    ['s97', 's98']
]

sybil_edges10 = [
    [16, 's101'],
    [16, 's102'],
    [16, 's103'],
    [16, 's104'],
    [16, 's105'],
    [16, 's106'],
    [16, 's107'],
    [16, 's108'],
    ['s101', 's102'],
    ['s103', 's104'],
    ['s105', 's106'],
    ['s107', 's108']
]

connectors = [
    [201, 1201],
    [101, 1101],
    [202, 1202],
    [102, 1102],
    [203, 1203],
    [103, 1103],
    [204, 1201],
    [104, 1101],
    [205, 1202],
    [105, 1102],
    [206, 1203],
    [106, 1103],
    [201, 1204],
    [101, 1104],
    [202, 1205],
    [102, 1105],
    [203, 1206],
    [103, 1106],
    [204, 1204],
    [104, 1104],
    [205, 1205],
    [105, 1105],
    [206, 1206],
    [106, 1106],
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

graph_1 = graphs.generators.group_based.generate(graph_params_1)
graph_2 = graphs.generators.group_based.generate(graph_params_2)

graph = nx.compose(graph_1, graph_2)
add_sybils(graph, connectors, 'joined')
add_sybils(graph, sybil_edges1, 'sybil1')
add_sybils(graph, sybil_edges1b, 'sybil1b')
# add_sybils(graph, sybil_edges2, 'sybil2')
# add_sybils(graph, sybil_edges3, 'sybil3')
# add_sybils(graph, sybil_edges4, 'sybil4')
# add_sybils(graph, sybil_edges5, 'sybil5')
# add_sybils(graph, sybil_edges6, 'sybil6')
# add_sybils(graph, sybil_edges7, 'sybil7')
# add_sybils(graph, sybil_edges8, 'sybil8')
# add_sybils(graph, sybil_edges9, 'sybil9')
# add_sybils(graph, sybil_edges10, 'sybil10')
outputs = []

# ranker = algorithms.SybilGroupRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SybilGroupRank.html'))
# reset_ranks(graph)

ranker = algorithms.GroupSybilRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'GroupSybilRank_merged.html'))
reset_ranks(graph)

ranker = algorithms.GroupSybilRank(graph_2, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph))
draw_graph(graph_2, os.path.join(OUTPUT_FOLDER, 'GroupSybilRank_unmerged.html'))
reset_ranks(graph_2)

# ranker = algorithms.GroupSybilRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'GroupSybilRank.html'))
# reset_ranks(graph)
#
# ranker = algorithms.GroupMergingRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'GroupMerge.html'))
#
# write_output_file(outputs, os.path.join(OUTPUT_FOLDER, 'result.csv'))