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
                 db['groups'].insert({'_key': group, 'seed': True if group.find('seed_group_') != -1 else False})
            db['usersInGroups'].insert({'user': str(node.name), 'group': group})
    for edge in graph.edges():
        db['connections'].insert({'_from': 'users/{0}'.format(edge[0].name), '_to': 'users/{0}'.format(edge[1].name)})


def update(nodes_graph, groups_graph):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    for node in nodes_graph.nodes:
        db['users'].update({'_key': node.name, 'rank': node.rank})
    for group in groups_graph.nodes:
        db['groups'].update({'_key': group.name, 'rank': group.rank})
    return True


def load():
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    users = db.collection('users')
    groups = db.collection('groups')
    connections = db.collection('connections')
    usersInGroups = db.collection('usersInGroups')
    user_groups = {}
    seed_groups = set([group['_key'] for group in groups if group['seed']])
    for user_group in usersInGroups:
        if not user_group['user'] in user_groups:
            user_groups[user_group['user']] = set()
        user_groups[user_group['user']].add(user_group['group'])
    users_dic = {}
    for user in users:
        user_type = 'Seed' if user_groups[user['_key']] & seed_groups else 'Honest'
        users_dic[user['_key']] = graphs.node.Node(user['_key'], user_type, user_groups[user['_key']], user['rank'])
    edges = [(users_dic[connection['_from'].replace('users/', '')], users_dic[connection['_to'].replace('users/', '')])
        for connection in connections]
    graph = nx.Graph()
    graph.add_edges_from([(edge[0], edge[1]) for edge in edges])
    return graph


def clear():
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    for collection in ['users', 'groups', 'usersInGroups', 'connections']:
        for data in db[collection]:
            db[collection].delete(data)


if __name__ == '__main__':
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
