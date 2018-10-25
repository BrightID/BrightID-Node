from arango import ArangoClient
from db_config import DB_NAME, DB_USER, DB_PASS
from algorithms.sybil_rank import SybilRank


def groups(user):
    db = ArangoClient().db(DB_NAME, username=DB_USER, password=DB_PASS)
    res = db.aql.execute(
        'FOR doc IN usersInGroups FILTER doc._from == @value RETURN doc._to',
        bind_vars={'value': 'users/{0}'.format(user)})
    groups = [group.replace('groups/', '') for group in res]
    return groups


def users(group):
    db = ArangoClient().db(DB_NAME, username=DB_USER, password=DB_PASS)
    res = db.aql.execute(
        'FOR doc IN usersInGroups FILTER doc._to == @value RETURN doc._from',
        bind_vars={'value': 'groups/{0}'.format(group)})
    users = [user.replace('users/', '') for user in res]
    return users


def user_neighbors(user):
    neighbors = set()
    db = ArangoClient().db(DB_NAME, username=DB_USER, password=DB_PASS)
    res = db.aql.execute(
        'FOR doc IN connections FILTER doc._from == @value or doc._to == @value RETURN doc',
        bind_vars={'value': 'users/{0}'.format(user)})
    for edge in res:
        neighbors.add(edge['_from'].replace('users/', ''))
        neighbors.add(edge['_to'].replace('users/', ''))
    neighbors.remove(user)
    return neighbors


def group_neighbors(group):
    neighbors = set()
    for user in users(group):
        for neighbor in user_neighbors(user):
            for neighbor_group in groups(neighbor):
                neighbors.add(neighbor_group)
    neighbors.remove(group)
    return neighbors


def affinity(group1, group2):
    db = ArangoClient().db(DB_NAME, username=DB_USER, password=DB_PASS)
    removed = set()
    weight = 0
    group1_users = sorted(users(group1))
    for user1 in group1_users:
        if user1 in removed:
            continue
        group2_users = sorted(users(group2))
        for user2 in group2_users:
            if user1 in removed:
                break
            if user2 in removed:
                continue
            res = db.aql.execute(
                'FOR doc IN connections FILTER (doc._from == @source and doc._to == @target) or (doc._from == @target and doc._to == @source) RETURN doc',
                bind_vars={
                    'source': 'users/{0}'.format(user1),
                    'target': 'users/{0}'.format(user2)
                })
            if res.empty():
                continue
            removed.add(user1)
            removed.add(user2)
            weight += 1
    if weight > 0:
        weight = 1.0 * weight / (len(group1_users) + len(group2_users))
    return weight


def estimate_score(group):
    db = ArangoClient().db(DB_NAME, username=DB_USER, password=DB_PASS)
    groups = db.collection('groups')
    neighbors = group_neighbors(group)
    new_raw_rank = 0
    for neighbor in neighbors:
        new_affinity = affinity(group, neighbor)
        res = db.aql.execute(
            'FOR doc IN affinity FILTER (doc._from == @source and doc._to == @target) or (doc._from == @target and doc._to == @source) RETURN doc.weight',
            bind_vars={
                'source': 'groups/{0}'.format(group),
                'target': 'groups/{0}'.format(neighbor)
            })
        old_affinity = res.next()
        new_raw_rank += (groups[group]['raw_rank'] * new_affinity) / float(
            groups[neighbor]['degree'])
        print('Source: {0}, Target: {1}, Old Affinity: {2}\nNew Affinity: {3}'.
              format(group, neighbor, old_affinity, new_affinity))
    print('Old Raw Rank: {0}\nNew Raw Rank: {1}'.format(
        groups[group]['raw_rank'], new_raw_rank))
    ranks = [(g['_key'], g['raw_rank']) for g in groups if g['_key'] != group]
    ranks.append((group, new_raw_rank))
    new_rank = dict(SybilRank.nonlinear_distribution(ranks, .5, 10, 90))[group]
    print('Old Rank: {0}\nNew Rank: {1}'.format(groups[group]['rank'],
                                                new_rank))
    return new_rank


if __name__ == '__main__':
    estimate_score('group_1')
