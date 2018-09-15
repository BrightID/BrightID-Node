import random


def remove_weak_attackers(graph, cut_point):
    attackers = [node for node in graph.nodes if node.node_type == 'Attacker']
    attackers.sort(key=lambda node: node.rank, reverse=True)
    cut_index = int((1-cut_point) * len(attackers))
    nodes_to_remove = attackers[cut_index:]
    graph.remove_nodes_from(nodes_to_remove)
    for node in graph.nodes():
        if graph.degree(node) != 0:
            continue
        pair = random.choice(attackers[:cut_index])
        graph.add_edge(node, pair)


def add_sybil_to_attacker_con(graph, num):
    sybils = [node for node in graph.nodes if node.node_type == 'Sybil']
    attackers = [node for node in graph.nodes if node.node_type == 'Attacker']
    for sybil in sybils:
        j = 0
        while j < num:
            pair = random.choice(attackers)
            if pair not in graph.neighbors(sybil):
                j += 1
                graph.add_edge(sybil, pair)
