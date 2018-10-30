import networkx as nx
from arango import ArangoClient
import graphs
import algorithms
from utils import *
from db_config import *


def save(graph):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    for node in graph.nodes:
        db['users'].insert({'_key': str(node.name), 'rank': node.rank})
        for group in node.groups:
            if not db['groups'].get({'_key': group}):
                if group.find('seed_group_') != -1:
                    db['groups'].insert({'_key': group, 'seed': True})
                else:
                    db['groups'].insert({'_key': group})
            db['usersInGroups'].insert(
                {'_from': 'users/{0}'.format(node.name), '_to': 'groups/{0}'.format(group)})
    for edge in graph.edges():
        db['connections'].insert(
            {'_key': '{0}-{1}'.format(edge[0].name, edge[1].name), '_from': 'users/{0}'.format(edge[0].name), '_to': 'users/{0}'.format(edge[1].name)})


def update(nodes_graph, groups_graph):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    for node in nodes_graph.nodes:
        db['users'].update({'_key': node.name, 'rank': node.rank})
    for group in groups_graph.nodes:
        db['groups'].update({'_key': group.name, 'rank': group.rank,
            'raw_rank': group.raw_rank, 'degree': group.degree})
    for affinity in db['affinity']:
        db['affinity'].delete(affinity)
    for edge in groups_graph.edges.data():
        db['affinity'].insert({'_key': '{0}-{1}'.format(edge[0], edge[1]), '_from': 'groups/{0}'.format(
            edge[0]), '_to': 'groups/{0}'.format(edge[1]), 'weight': edge[2]['weight']})


def load():
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    users = db.collection('users')
    groups = db.collection('groups')
    connections = db.collection('connections')
    usersInGroups = db.collection('usersInGroups')
    user_groups = {}
    seed_groups = set([group['_key']
                       for group in groups if group.get('seed', None)])
    for user_group in usersInGroups:
        if not user_group['_from'].replace('users/', '') in user_groups:
            user_groups[user_group['_from'].replace('users/', '')] = set()
        user_groups[user_group['_from'].replace(
            'users/', '')].add(user_group['_to'].replace('groups/', ''))
    users_dic = {}
    for user in users:
        user_type = 'Seed' if user_groups[user['_key']
                                          ] & seed_groups else 'Honest'
        users_dic[user['_key']] = graphs.node.Node(
            user['_key'], user_type, user_groups[user['_key']], user['rank'])
    edges = [(users_dic[connection['_from'].replace('users/', '')], users_dic[connection['_to'].replace('users/', '')])
             for connection in connections]
    graph = nx.Graph()
    graph.add_edges_from([(edge[0], edge[1]) for edge in edges])
    return graph


def load_group_graph():
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    groups = db.collection('groups')
    group_connections = db.collection('affinity')
    edges = []
    i = 0
    group_dic = {}
    for group in groups:
        group_dic[group['_key']] = graphs.node.Node(
            group['_key'], 'Seed' if 'seed' in group and group['seed'] else 'Honest',
            [],
            group['rank'],
            group['raw_rank'],
            group['degree']
        )
    for connection in group_connections:
        edges.append((
            group_dic[connection['_from'].replace('groups/', '')],
            group_dic[connection['_to'].replace('groups/', '')],
            {'weight': connection['weight']}
        ))
    graph = nx.Graph()
    graph.add_edges_from(edges)
    return graph


def clear():
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    for collection in ['users', 'groups', 'usersInGroups', 'connections']:
        for data in db[collection]:
            db[collection].delete(data)


if __name__ == '__main__':
    clear()
    graph = load_graph('simulation_platform/graph.json')
    save(graph)
    graph = load()
    reset_ranks(graph)
    ranker = algorithms.SybilGroupRank(graph, {
        'min_degree': 5,
        'accumulative': False,
        'weaken_under_min': False,
        'nonlinear_distribution': True,
    })
    ranker.rank()
    draw_graph(ranker.graph, 'nodes.html')
    draw_graph(ranker.group_graph, 'groups.html')
    update(ranker.graph, ranker.group_graph)
