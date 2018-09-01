import networkx as nx
import matplotlib.pyplot as plt
import random

nonBridgeToBridgeNo = 1
nHonest = 30
attackerToHonestRatio = .3
avgDegree = 5
minDegree = 2
maxDegree = 7
sybilToAttackerRatio = 5
attackerToHonestRatio = .1
bridgeSybilPercentage = 20
bridgeSybilDensity = 3


class Node():
    def __init__(self, name, nodeType):
        self.name = name
        self.nodeType = nodeType


def randomSecondNode(graph, firstNode, nodesList, maxDegree):
    theNode = None
    while not theNode:
        randNode = random.choice(nodesList)
        if graph.degree(randNode) < maxDegree:
            theNode = randNode
    return theNode


def init():
    nAttacker = int(attackerToHonestRatio * nHonest)
    nSybil = int(sybilToAttackerRatio * nAttacker)
    nBridgeSybil = bridgeSybilPercentage * nSybil / 100
    nNonBridgeToBridgeNo = nSybil - nBridgeSybil
    nAll = nHonest + nAttacker + nSybil
    categories = {
        'Honests':{'nodes': [], 'color': 'green', 'num': nHonest},
        'BridgeSybil':{'nodes': [], 'color': 'orange', 'num': nBridgeSybil},
        'NonBridgeSybil':{'nodes': [], 'color': 'red', 'num': nNonBridgeToBridgeNo},
        'Attackers':{'nodes': [], 'color': 'black', 'num': nAttacker}
    }
    graph = nx.Graph()
    counter = 0
    for category in categories:
        for i in range(categories[category]['num']):
            node = Node(counter, category)
            categories[category]['nodes'].append(node)
            graph.add_node(node)
            counter += 1
    lDegrees = range(minDegree, avgDegree)
    uDegrees = range(avgDegree, maxDegree+1)
    nonSybils = categories['Honests']['nodes']+categories['Attackers']['nodes']
    for i, node in enumerate(nonSybils):
        nodeDegree = graph.degree(node)
        graphDegree = sum(degree for node, degree in graph.degree()) / (i + 1)
        randDegree = random.choice(uDegrees)
        if graphDegree < avgDegree :
            degree = random.choice(uDegrees)
        else:
            degree = random.choice(lDegrees)
        j = 0
        while j < degree:
            per = random.choice(nonSybils)
            if node != per and graph.degree(per) < maxDegree:
                graph.add_edge(node, per)
                j += 1
            # TODO: Check if infinit loop is possible
            # else:
            #     print(node.name, per.name)
    print(sum(degree for node, degree in graph.degree()) / (i + 1))
    visualize(graph, categories)


def visualize(graph, categories, filename=None, format="pdf"):
    layout = nx.kamada_kawai_layout(graph)
    handles = []
    for category in categories:
        handle = nx.draw_networkx_nodes(
            graph,
            layout,
            nodelist=categories[category]['nodes'],
            node_size=50,
            node_color=categories[category]['color']
        )
        handle.set_label(category)
        handles.append(handle)

    nx.draw_networkx_edges(
        graph,
        layout,
        edge_color="green",
        alpha=0.5
    )

    plt.legend(
        handles,
        categories.keys(),
        scatterpoints=1
    )
    plt.axis('off')

    if filename:
        plt.savefig(
            "{0}.{1}".format(filename, file_format),
            format=format
        )
        plt.clf()
    else:
        plt.show()

if __name__ == '__main__':
    init()
