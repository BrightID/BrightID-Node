def calculate(graph, group_graph):
    groups = {}
    for node in graph.nodes:
        for group in node.groups:
            if group not in groups:
                groups[group] = set()
            groups[group].add(node)
    groups_dict = {
        group_object.name: group_object
        for group_object in group_graph.nodes
    }
    inconsistency_dict = {}
    for group in groups:
        nodes = sorted(groups[group], key=lambda n: n.name)
        node_neighbors_dict = {}
        for node in nodes:
            node_neighbors_dict[node] = set()
            for neighbor in graph.neighbors(node):
                if group not in neighbor.groups:
                    node_neighbors_dict[node].update(neighbor.groups)
        nodes_activity = [
            sum([groups_dict[g].raw_rank for g in node_neighbors_dict[node]])
            for node in nodes
        ]
        avg_activity = sum(nodes_activity) / len(nodes_activity)
        actives = [
            activity for activity in nodes_activity if activity >= avg_activity
        ]
        inactives = [
            activity for activity in nodes_activity if activity <= avg_activity
        ]
        # It should never happens but in some situations takes place
        # because of floating point problems.
        if len(actives) == 0 or len(inactives) == 0:
            groups_dict[group].inconsistency = 0
            continue
        avg_actives = sum(actives) / len(actives)
        avg_inactives = sum(inactives) / len(inactives)
        if avg_inactives > 0:
            inconsistency = avg_actives / avg_inactives
        else:
            inconsistency = None
        multiplier = (float(len(inactives)) / len(actives)) ** .5
        if multiplier > 1 and inconsistency is not None:
            inconsistency *= multiplier
        inconsistency_dict[group] = inconsistency
    max_inconsistencies = max(
        [inconsistency_dict[node] for node in inconsistency_dict])
    for group in groups:
        if inconsistency_dict[group] is None:
            inconsistency_dict[group] = max_inconsistencies
    return sorted(inconsistency_dict.items(), key=lambda g: g[1], reverse=True)
