from arango import ArangoClient
import itertools
import time

seed_connection_levels = ['just met', 'already know', 'recovery']
node_connection_levels = ['already know', 'recovery']
CONN_DIFF_TIME = 60 * 60 * 1000
GO_BACK_TIME = 10 * 24 * 60 * 60 * 1000

db = ArangoClient().db('_system')


def verify(fname):
    print('SEED CONNECTED WITH FRIEND')
    seed_groups = list(db['groups'].find({'seed': True}))
    seed_groups_members = {}
    all_seeds = set()
    for seed_group in seed_groups:
        userInGroups = db['usersInGroups'].find({'_to': seed_group['_id']})
        seeds = set([ug['_from'] for ug in userInGroups])
        all_seeds.update(seeds)
        seed_groups_members[seed_group['_id']] = seeds

    checked = set()
    for i, seed_group in enumerate(seed_groups_members):
        members = seed_groups_members[seed_group]
        for seed in members:
            time_limit = (int(time.time()) * 1000) - GO_BACK_TIME
            conns = db.aql.execute('''
                FOR c IN connections
                    FILTER c._from == @seed
                        AND c.level IN @levels
                        AND c.timestamp > @time_limit
                    FOR cc IN connections
                        FILTER cc._from == c._to
                            AND cc._to == c._from
                            AND cc.level IN @levels
                        RETURN c
            ''', bind_vars={'seed': seed, 'levels': seed_connection_levels, 'time_limit': time_limit}
            )
            seed_neighbors = {}
            for conn in conns:
                neighbor = conn['_from'] if conn['_to'] == seed else conn['_to']
                if neighbor in all_seeds:
                    continue

                seed_neighbors[neighbor] = conn['timestamp']
            pairs = itertools.combinations(seed_neighbors.keys(), 2)
            for pair in pairs:
                if pair in checked:
                    continue
                time_diff = abs(
                    seed_neighbors[pair[0]] - seed_neighbors[pair[1]])
                if time_diff > CONN_DIFF_TIME:
                    continue
                check_conditions(pair, seed)
                checked.add(pair)

    verifiedCount = db['verifications'].find(
        {'name': 'SeedConnectedWithFriend'}).count()
    print(f'verifieds: {verifiedCount}\n')


def check_conditions(pair, seed):
    conn = db.aql.execute('''
        FOR c IN connections
            FILTER c._from == @from
                AND c._to == @to
                AND c.level IN @levels
            FOR cc IN connections
                FILTER cc._from == c._to
                    AND cc._to == c._from
                    AND cc.level IN @levels
            RETURN c
        ''', bind_vars={'from': pair[0], 'to': pair[1], 'levels': node_connection_levels}
    )
    if conn.empty():
        return

    p0 = pair[0].replace('users/', '')
    p0_verifications = {
        v['name']: v for v in db['verifications'].find({'user': p0})}
    if 'SeedConnected' not in p0_verifications:
        return

    p1 = pair[1].replace('users/', '')
    p1_verifications = {
        v['name']: v for v in db['verifications'].find({'user': p1})}
    if 'SeedConnected' not in p1_verifications:
        return

    if 'SeedConnectedWithFriend' not in p0_verifications:
        db['verifications'].insert({
            'name': 'SeedConnectedWithFriend',
            'user': p0,
            'timestamp': int(time.time() * 1000)
        })
        print(f'user: {p0}\tverification: SeedConnectedWithFriend')

    if 'SeedConnectedWithFriend' not in p1_verifications:
        db['verifications'].insert({
            'name': 'SeedConnectedWithFriend',
            'user': p1,
            'timestamp': int(time.time() * 1000)
        })
        print(f'user: {p1}\tverification: SeedConnectedWithFriend')
