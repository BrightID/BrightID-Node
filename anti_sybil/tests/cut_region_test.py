import networkx as nx
import matplotlib.pyplot as plt
from algorithms import sybil_rank
import random

nHonest = 50
avgDegree = 5
minDegree = 2
maxDegree = 7
nSeedNodes = 5

nAttackerTOnHonest = .1
nSybilTOnAttacker = 5
nBridgeTOnNonBridge = .2
nonBridgeToBridgeConNo = 1
bridgeToAttackersCon = .7


class Node():
    def __init__(self, name, nodeType, rank=None):
        self.name = name
        self.nodeType = nodeType
        self.rank = rank


def init():
    nAttacker = int(nAttackerTOnHonest * nHonest)
    nSybil = int(nSybilTOnAttacker * nAttacker)
    nBridgeSybil = int(nBridgeTOnNonBridge * nSybil)
    nNonBridgeSybil = nSybil - nBridgeSybil
    nAll = nHonest + nAttacker + nSybil
    categories = {
        'Honest': {'nodes': [], 'color': 'green', 'num': nHonest},
        'BridgeSybil': {'nodes': [], 'color': 'orange', 'num': nBridgeSybil},
        'NonBridgeSybil': {'nodes': [], 'color': 'red', 'num': nNonBridgeSybil},
        'Attacker': {'nodes': [], 'color': 'black', 'num': nAttacker}
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
    nonSybils = categories['Honest']['nodes']+categories['Attacker']['nodes']
    for i, node in enumerate(nonSybils):
        nodeDegree = graph.degree(node)
        graphDegree = sum(graph.degree().values()) / (i + 1)
        if graphDegree < avgDegree:
            degree = random.choice(uDegrees)
        else:
            degree = random.choice(lDegrees)
        j = 0
        pairs = []
        while j < degree:
            pair = random.choice(nonSybils)
            if node != pair and graph.degree(pair) < maxDegree and pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1
            # TODO: Check if infinit loop is possible
            # else:
            #     print(node.name, pair.name)

    for i, node in enumerate(categories['NonBridgeSybil']['nodes']):
        nodeDegree = graph.degree(node)
        perBridge = random.choice(categories['BridgeSybil']['nodes'])
        graph.add_edge(node, perBridge)
        # TODO: What about conctions between NonBridgeSybils?
        # degree = random.choice(lDegrees)
        # j = 0
        # while j < degree:
        #     pair = random.choice(categories['NonBridgeSybil']['nodes'])
        #     if node != pair and graph.degree(pair) < maxDegree:
        #         graph.add_edge(node, pair)
        #         j += 1

    for i, node in enumerate(categories['BridgeSybil']['nodes']):
        nContectionToAttacker = int(
            bridgeToAttackersCon * categories['Attacker']['num'])
        pairs = []
        j = 0
        while j < nContectionToAttacker:
            pair = random.choice(categories['Attacker']['nodes'])
            if pair not in pairs:
                graph.add_edge(node, pair)
                pairs.append(pair)
                j += 1

    return graph, categories


def visualize(graph, categories, labels = None, filename = None, fileFormat="svg"):
    layout = nx.spring_layout(graph)
    # layout = nx.kamada_kawai_layout(graph)
    handles = []
    for category in categories:
        handle = nx.draw_networkx_nodes(
            graph,
            layout,
            nodelist=categories[category]['nodes'],
            node_size=50,
            node_color=categories[category]['color'],
            alpha=0.6
        )
        handle.set_label(category)
        handles.append(handle)

    nx.draw_networkx_edges(
        graph,
        layout,
        edge_color="green",
        alpha=0.5
    )

    if labels:
        nx.draw_networkx_labels(graph, layout, labels, font_size=4)

    plt.legend(
        handles,
        categories.keys(),
        scatterpoints=1
    )
    plt.axis('off')

    if filename:
        plt.savefig(
            "{0}.{1}".format(filename, fileFormat),
            format=fileFormat
        )
        plt.clf()
    else:
        plt.show()


if __name__ == '__main__':
    graph, categories = init()
    seedNodes = random.sample(categories['Honest']['nodes'], nSeedNodes)
    detector = sybil_rank.SybilRanker(graph, seedNodes)
    results = detector.detect()
    visualize(graph, categories, dict(results.ranked_trust), 'output')

