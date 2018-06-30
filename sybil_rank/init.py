import random, sys
from arango import ArangoClient

def init(db, nodes_num, edges_num):
    community = db.create_graph('community')
    users = community.create_vertex_collection('users')
    connections = community.create_edge_definition(
        edge_collection='connections',
        from_vertex_collections=['users'],
        to_vertex_collections=['users']
    )
    # Making new vertices
    for i in range(nodes_num):
        users.insert({'_key': 'node%s'%i, 'name': 'Node%s'%i})
        if i > 0:
            # To make graph connected, we connect each vertex to previous one
            connections.insert({
                '_key': 'u%s-u%s'%(i, i-1),
                '_from': 'users/node%s'%i,
                '_to': 'users/node%s'%(i-1)
            })
            
    i = 0
    # Making rest of edges randomly here
    while i < edges_num - nodes_num + 1:
        u1 = random.randint(0, nodes_num)
        u2 = random.randint(0, nodes_num)
        if u1 == u2 or connections.has('u%s-u%s'%(u1, u2)):
            continue
        connections.insert({
            '_key': 'u%s-u%s'%(u1, u2),
            '_from': 'users/node%s'%u1,
            '_to': 'users/node%s'%u2
        })
        i += 1

if __name__ == '__main__':
    print('Initalization of database started.')
    try:
        client = ArangoClient()
        db_name = raw_input('Please enter Arango db name: [brightid_db] ')
        if not db_name.strip():
            db_name = 'brightid_db'
        db = client.db('_system')
        db.create_database(db_name)
        db = client.db(db_name)
    except:
        print('Database can not be reached!')
        raise
        sys.exit()
    num_vertices = raw_input('Please enter number of vertices: [50] ')
    if not (num_vertices.strip() or num_vertices.isdigit()):
        num_vertices = 50
    num_edges = raw_input('Please enter number of edges: [300] ')
    if not (num_edges.strip() or num_edges.isdigit()):
        num_edges = 300
    if int(num_edges)+1 < int(num_vertices):
        print('To make graph connected, number of edges must be greater than vertices.')
        sys.exit()
    init(db, int(num_vertices), int(num_edges))
