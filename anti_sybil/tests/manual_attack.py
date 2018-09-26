import networkx as nx
import algorithms
from graphs.node import Node
from utils import *

OUTPUT_FOLDER = './outputs/manual_attack/'


def add_sybils(graph, sybils_file_name):
    nodes_dic = {node.name: node for node in graph.nodes()}
    input_file = open(sybils_file_name, 'rb')
    edges = []
    for i, row in enumerate(input_file):
        edge = row.strip().split()
        edge = [int(node_name) if node_name.isdigit() else node_name for node_name in edge]
        for node_name in edge:
            if node_name not in nodes_dic:
                nodes_dic[node_name] = Node(node_name, 'Sybil', groups=set(['sybils']))
        edges.append((nodes_dic[edge[0]], nodes_dic[edge[1]]))
    graph.add_edges_from(edges)
    sybils = [node for node in nodes_dic.values() if node.node_type=='Sybil']
    for sybil in sybils:
        for neighbour in graph.neighbors(sybil):
            if neighbour.node_type != 'Sybil':
                # neighbour.node_type = 'Attacker'
                neighbour.groups.add('sybils')


graph = load_graph('inputs/graph.json')
add_sybils(graph, 'inputs/sybils.txt')
ranker = algorithms.SybilGroupRank(graph, {
    'min_degree': 5,
    'accumulative': False,
    'weaken_under_min': True,
    'nonlinear_distribution': True,
    'group_edge_weight': 2
})
ranker.rank()
output = generate_output(graph)
write_output_file([output], os.path.join(OUTPUT_FOLDER, 'result.csv'))
draw_graph(graph, os.path.join(OUTPUT_FOLDER, 'nodes.html'))