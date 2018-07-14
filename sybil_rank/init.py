import sys
import random
import networkx as nx
from arango import ArangoClient
from db_config import *
from init_config import *

def init_graph(num_nodes, node_degree, prob_traid):
    graph = nx.powerlaw_cluster_graph(
        num_nodes,
        node_degree,
        prob_traid,
        None
    )
    if not nx.is_connected(graph):
        components = nx.connected_components(graph)
        biggest_comp = []
        for i, component in enumerate(components):
            if len(component) > len(biggest_comp):
                biggest_comp = component
        components.remove(biggest_comp)
        for component in components:
            for left_node in component:
                right_node = random.choice(biggest_comp)
                graph.add_edge(left_node, right_node)
    assert len(nx.connected_components(graph)) == 1
    return graph

def init(db):
    community = db.create_graph('community')
    users = community.create_vertex_collection('users')
    connections = community.create_edge_definition(
        edge_collection='connections',
        from_vertex_collections=['users'],
        to_vertex_collections=['users']
    )
    # initialize sybil graph
    sybil_graph = init_graph(SYBIL_NUM_NODES, SYBIL_NODE_DEGREE, SYBIL_PROB_TRIAD)
    # initialize honest graph
    honest_graph = init_graph(HONEST_NUM_NODES, HONEST_NODE_DEGREE, HONEST_PROB_TRIAD)
    # initialize final graph    
    final_graph = nx.disjoint_union(honest_graph, sybil_graph)
    honest_nodes = honest_graph.nodes()
    sybil_nodes = sybil_graph.nodes()
    if STITCH_NUM > len(honest_nodes) * len(sybil_nodes):
        raise Exception("Too many edges to stitch")
    stitch = []
    while len(stitch) != STITCH_NUM:
        edge = (random.choice(honest_nodes), random.choice(sybil_nodes))
        if edge in stitch:
            continue
        stitch.append(edge)
    for (left_node, right_node) in stitch:
        edge = (left_node, len(honest_nodes)+right_node)
        final_graph.add_edges_from([edge])   
    # insert final graph into db
    trusted_nodes = random.sample(honest_nodes, TRUSTED_NODES_NUM)
    for node in final_graph.nodes():
    	node_type = 'honest' if node in honest_graph.nodes() else 'sybil'
        users.insert({'_key': 'node%s'%node, 'name': 'Node%s'%node, 'type': node_type, 'trusted': node in trusted_nodes })
    for edge in final_graph.edges():
        connections.insert({'_key': 'u%s-u%s'%(edge[0], edge[1]), '_from': 'users/node%s'%edge[0], '_to': 'users/node%s'%edge[1]})

if __name__ == '__main__':
    print('Initalization of database started.')
    client = ArangoClient()
    db = client.db('_system', username=DB_USER, password=DB_PASS)
    db.create_database(DB_NAME)
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    init(db)
