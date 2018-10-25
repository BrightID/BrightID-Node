import sys
sys.path.append('..')

import algorithms
from graphs.node import Node
from utils import *

OUTPUT_FOLDER = './outputs/dense_graph_target_attack/'

graph_params = {
    'num_seed_nodes': 14,
    'num_attacker_to_num_honest': 0.0,
    'num_sybil_to_num_attacker': 2,
    'num_groups': 19,
    'min_group_nodes': 3,
    'max_group_nodes': 25,
    'num_joint_node': 200,
    'num_seed_groups': 1,
    'min_known_ratio': .125,
    'avg_known_ratio': .5,
    'max_known_ratio': 1,
    'sybil_to_attackers_con': .2,
    'num_inter_group_con': 210
}

algorithm_options = {
    'accumulative': False,
    'weaken_under_min': False,
    'min_degree': 14,
    'weaken_seed': 0,
    'nonlinear_distribution': True,
    'group_edge_weight': 20,
    'thresholds': [.36, .24, .22, .21, .20, .19, .18, .12, .06, .04, .02, .01, .005, .004, .003, .002, .0015, .001, .0005, 0]
}

sybil_edges1 = [
    [6, 's1'],
    [6, 's2'],
    [6, 's3'],
    [6, 's4'],
    [6, 's5'],
    [6, 's6'],
    [6, 's7'],
    [6, 's8'],
    # [7, 's1'],
    # [7, 's2'],
    # [7, 's3'],
    # [7, 's4'],
    # [7, 's5'],
    # [7, 's6'],
    # [7, 's7'],
    # [7, 's8'],
    # [8, 's1'],
    # [8, 's2'],
    # [8, 's3'],
    # [8, 's4'],
    # [8, 's5'],
    # [8, 's6'],
    # [8, 's7'],
    # [8, 's8'],
    # [9, 's1'],
    # [9, 's2'],
    # [9, 's3'],
    # [9, 's4'],
    # [9, 's5'],
    # [9, 's6'],
    # [9, 's7'],
    # [9, 's8'],
    # [1, 's1'],
    # [1, 's2'],
    # [1, 's3'],
    # [1, 's4'],
    # [1, 's5'],
    # [1, 's6'],
    # [1, 's7'],
    # [1, 's8'],
    # [2, 's1'],
    # [2, 's2'],
    # [2, 's3'],
    # [2, 's4'],
    # [2, 's5'],
    # [2, 's6'],
    # [2, 's7'],
    # [2, 's8'],
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

sybil_edges2 = [
    [6, 's11'],
    [6, 's12'],
    [6, 's13'],
    [6, 's14'],
    [6, 's15'],
    [6, 's16'],
    [6, 's17'],
    [6, 's18'],
    ['s11', 's12'],
    ['s13', 's14'],
    ['s15', 's16'],
    ['s17', 's18']
]

sybil_edges3 = [
    [6, 's21'],
    [6, 's22'],
    [6, 's23'],
    [6, 's24'],
    [6, 's25'],
    [6, 's26'],
    [6, 's27'],
    [6, 's28'],
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
    [6, 's41'],
    [6, 's42'],
    [6, 's43'],
    [6, 's44'],
    [6, 's45'],
    [6, 's46'],
    [6, 's47'],
    [6, 's48'],
    ['s41', 's42'],
    ['s43', 's44'],
    ['s45', 's46'],
    ['s47', 's48']
]

sybil_edges5 = [
    [6, 's51'],
    [6, 's52'],
    [6, 's53'],
    [6, 's54'],
    [6, 's55'],
    [6, 's56'],
    [6, 's57'],
    [6, 's58'],
    ['s51', 's52'],
    ['s53', 's54'],
    ['s55', 's56'],
    ['s57', 's58']
]

sybil_edges6 = [
    [6, 's61'],
    [6, 's62'],
    [6, 's63'],
    [6, 's64'],
    [6, 's65'],
    [6, 's66'],
    [6, 's67'],
    [6, 's68'],
    ['s61', 's62'],
    ['s63', 's64'],
    ['s65', 's66'],
    ['s67', 's68']
]

sybil_edges7 = [
    [6, 's71'],
    [6, 's72'],
    [6, 's73'],
    [6, 's74'],
    [6, 's75'],
    [6, 's76'],
    [6, 's77'],
    [6, 's78'],
    ['s71', 's72'],
    ['s73', 's74'],
    ['s75', 's76'],
    ['s77', 's78']
]

sybil_edges8 = [
    [6, 's81'],
    [6, 's82'],
    [6, 's83'],
    [6, 's84'],
    [6, 's85'],
    [6, 's86'],
    [6, 's87'],
    [6, 's88'],
    ['s81', 's82'],
    ['s83', 's84'],
    ['s85', 's86'],
    ['s87', 's88']
]

sybil_edges9 = [
    [6, 's91'],
    [6, 's92'],
    [6, 's93'],
    [6, 's94'],
    [6, 's95'],
    [6, 's96'],
    [6, 's97'],
    [6, 's98'],
    ['s91', 's92'],
    ['s93', 's94'],
    ['s95', 's96'],
    ['s97', 's98']
]

sybil_edges10 = [
    [6, 's101'],
    [6, 's102'],
    [6, 's103'],
    [6, 's104'],
    [6, 's105'],
    [6, 's106'],
    [6, 's107'],
    [6, 's108'],
    ['s101', 's102'],
    ['s103', 's104'],
    ['s105', 's106'],
    ['s107', 's108']
]


def add_sybils(graph, sybil_edges, group):
    nodes_dic = {node.name: node for node in graph.nodes()}
    edges = []
    for edge in sybil_edges:
        # if edge[0] == 6:
        #     edge[0] = 26
        for node_name in edge:
            if node_name not in nodes_dic:
                nodes_dic[node_name] = Node(node_name, 'Sybil', groups=set([group]))
        edges.append((nodes_dic[edge[0]], nodes_dic[edge[1]]))
    graph.add_edges_from(edges)


graph = graphs.generators.group_based.generate(graph_params)
add_sybils(graph, sybil_edges1, 'sybil1')
add_sybils(graph, sybil_edges2, 'sybil2')
add_sybils(graph, sybil_edges3, 'sybil3')
add_sybils(graph, sybil_edges4, 'sybil4')
add_sybils(graph, sybil_edges5, 'sybil5')
# add_sybils(graph, sybil_edges6, 'sybil6')
# add_sybils(graph, sybil_edges7, 'sybil7')
# add_sybils(graph, sybil_edges8, 'sybil8')
# add_sybils(graph, sybil_edges9, 'sybil9')
# add_sybils(graph, sybil_edges10, 'sybil10')

outputs = []

# ranker = algorithms.SybilRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph, 'SybilRank'))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SybilRank.html'))
#
# reset_ranks(graph)

ranker = algorithms.SybilGroupRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph, 'SybilGroupRank'))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SybilGroupRank.html'))

reset_ranks(graph)

# ranker = algorithms.GroupSybilRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph, 'IntraGroupWeight'))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'IntraGroupWeight.html'))
#
# reset_ranks(graph)
# algorithm_options['weaken_under_min'] = True
#
# ranker = algorithms.SybilRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph, 'SR_weaken'))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SR_weaken.html'))
#
# reset_ranks(graph)
#
# ranker = algorithms.SybilGroupRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph, 'SGR_weaken'))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'SGR_weaken.html'))
#
# reset_ranks(graph)
#
# ranker = algorithms.GroupSybilRank(graph, algorithm_options)
# ranker.rank()
# outputs.append(generate_output(graph, 'IGW_weaken'))
# draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'IGW_weaken.html'))

reset_ranks(graph)

ranker = algorithms.GroupMergingRank(graph, algorithm_options)
ranker.rank()
outputs.append(generate_output(graph, 'GroupMerge'))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'GroupMerge.html'))

reset_ranks(graph)

write_output_file(outputs, os.path.join(OUTPUT_FOLDER, 'result.csv'))