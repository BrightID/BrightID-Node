import random


def remove_weak_attackers(graph, cut_point):
    nodes = [node for node in graph.nodes if node.node_type == 'Attacker']
    nodes.sort(key=lambda node: node.rank, reverse=True)
    cut_index = int((1-cut_point) * len(nodes))
    nodes_to_remove = nodes[cut_index:]
    graph.remove_nodes_from(nodes_to_remove)
    for node in graph.nodes():
        if node.node_type != 'Sybil' or graph.degree(node) != 0:
            continue
        pair = random.choice(nodes[:cut_index])
        graph.add_edge(node, pair)
