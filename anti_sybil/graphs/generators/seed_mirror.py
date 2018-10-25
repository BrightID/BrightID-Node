from ..node import Node


def mirror(graph, reflected_seed_group='seed_group_0'):
    """Duplicate all nodes in a graph except the seed nodes"""
    mirror_list = []
    mirror_dict = {}

    for node in graph.nodes():
        if reflected_seed_group in node.groups:
            continue
        copy_groups = set(map(lambda g: 'copy' + str(g), node.groups))
        copy = Node('copy' + str(node.name), 'Sybil', copy_groups)
        mirror_list.append(copy)
        mirror_dict[node.name] = copy

    graph.add_nodes_from(mirror_list)

    mirror_edges = []

    for edge in graph.edges():
        copy_edge = []

        for i in range(2):
            if reflected_seed_group in edge[i].groups:
                copy_edge.append(edge[i])
            else:
                copy_edge.append(mirror_dict[edge[i].name])

        mirror_edges.append(copy_edge)

    graph.add_edges_from(mirror_edges)

