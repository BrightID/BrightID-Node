from arango import ArangoClient
from utils import *
from db_config import *


def groups_of_user(node):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    cursor = db.aql.execute(
        'FOR doc IN usersInGroups FILTER doc._from == @value RETURN doc._to',
        bind_vars={'value': 'users/{0}'.format(node)}
    )
    groups = [group.replace('groups/', '') for group in cursor]
    return groups


def nodes_of_group(group):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    cursor = db.aql.execute(
        'FOR doc IN usersInGroups FILTER doc._to == @value RETURN doc._from',
        bind_vars={'value': 'groups/{0}'.format(group)}
    )
    nodes = [node.replace('users/', '') for node in cursor]
    return nodes


def get_node_neighbors(node):
    neighbors = []
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    cursor = db.aql.execute(
        'FOR doc IN connections FILTER doc._from == @value RETURN doc._to',
        bind_vars={'value': 'users/{0}'.format(node)}
    )
    neighbors.extend([group.replace('users/', '') for group in cursor])
    cursor = db.aql.execute(
        'FOR doc IN connections FILTER doc._to == @value RETURN doc._from',
        bind_vars={'value': 'users/{0}'.format(node)}
    )
    neighbors.extend([group.replace('users/', '') for group in cursor])
    return set(neighbors)


def get_group_neighbors(group):
    group_neighbors = set()
    nodes = nodes_of_group(group)
    for node in nodes:
        for neighbor in get_node_neighbors(node):
            for neighbor_group in groups_of_user(neighbor):
                group_neighbors.add(neighbor_group)
    group_neighbors.remove(group)
    return group_neighbors


def count_new_affinity(source, target):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    connections = db.collection('connections')
    removed = set()
    weight = 0
    source_nodes = sorted(nodes_of_group(source))
    for source_node in source_nodes:
        if source_node in removed:
            continue
        target_nodes = sorted(nodes_of_group(target))
        for target_node in target_nodes:
            if source_node in removed:
                break
            if target_node in removed:
                continue
            cursor = db.aql.execute(
                'FOR doc IN connections FILTER (doc._from == @source and doc._to == @target) or (doc._from == @target and doc._to == @source) RETURN doc',
                bind_vars={'source': 'users/{0}'.format(source_node), 'target': 'users/{0}'.format(target_node)}
            )
            if cursor.empty():
                continue
            removed.add(source_node)
            removed.add(target_node)
            weight += 1
    if weight > 0:
        weight = 1.0 * weight / (len(source_nodes) + len(target_nodes))
    return weight


def nonlinear_distribution(ranks, ratio, df, dt):
    avg_floating_points = sum([int(('%E'%rank[1]).split('E')[1]) for rank in ranks])/float(len(ranks))
    multiplier = 10 ** (-1 * (avg_floating_points - 1))
    nums = [rank[1] * multiplier for rank in ranks]
    counts = {}
    for num in nums:
        counts[int(num)] = counts.get(int(num), 0) + 1
    navg = sum(sorted(nums)[len(nums)/10:-1*len(nums)/10]) / (.8*len(nums))
    navg = int(navg)
    max_num = max(nums)
    # find distance from average which include half of numbers
    distance = 0
    while True:
        distance += 1
        count = sum([counts.get(i, 0) for i in range(navg-distance, navg+distance)])
        if count > len(nums)*ratio:
            break
    f, t = navg-distance, navg+distance
    ret = []
    for num in nums:
        if 0 <= num < f:
            num = num*df / f
        elif f <= num < t:
            num = df + (((num-f) / (t-f)) * (dt-df))
        else:
            num = dt + (((num-t) / (max_num-t)) * (100-dt))
        ret.append(int(num))
    return dict([(ranks[i][0], ret[i]) for i, rank in enumerate(ranks)])


def estimate_score(source):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    groups = db.collection('groups')
    group_connections = db.collection('affinity')
    neighbors = get_group_neighbors(source)
    new_raw_rank = 0
    for neighbor in neighbors:
        new_affinity = count_new_affinity(source, neighbor)
        cursor = db.aql.execute(
            'FOR doc IN affinity FILTER (doc._from == @source and doc._to == @target) or (doc._from == @target and doc._to == @source) RETURN doc.weight',
            bind_vars={'source': 'groups/{0}'.format(source), 'target': 'groups/{0}'.format(neighbor)}
        )
        old_affinity = [w for w in cursor][0]
        new_raw_rank += (groups[source]['raw_rank'] * new_affinity) / float(groups[neighbor]['degree'])
        print('Source: {0}, Target: {1}, Old Affinity: {2}\nNew Affinity: {3}'.format(
        source, neighbor, old_affinity, new_affinity))
    print('Old Raw Rank: {0}\nNew Raw Rank: {1}'.format(groups[source]['raw_rank'], new_raw_rank))
    cursor = db.aql.execute('FOR doc IN groups RETURN doc')
    ranks = [(doc['_key'], doc['raw_rank']) for doc in cursor if doc['_key']!=source]
    ranks.append((source, new_raw_rank))
    new_rank = nonlinear_distribution(ranks, .5, 10, 90)[source]
    print('Old Rank: {0}\nNew Rank: {1}'.format(groups[source]['rank'], new_rank))
    return new_rank


if __name__ == '__main__':
    estimate_score('group_15')
