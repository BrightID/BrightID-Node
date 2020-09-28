from arango import ArangoClient
import time
import sys
sys.path.append('..')
import config


def verify(graph):
    print('CALL JOINED')
    db = ArangoClient().db('_system')

    for group in config.CALL_GROUPS:
        userInGroups = db['usersInGroups'].find({'_to': 'groups/' + group})
        members = set([ug['_from'] for ug in userInGroups])

        conns = db.aql.execute(
            '''FOR d IN connections
                FILTER d._from IN @members
                    OR d._to IN @members
                RETURN d''',
            bind_vars={'members': list(members)}
        )

        neighbors = set()
        for conn in conns:
            neighbors.update([conn['_from'], conn['_to']])

        for neighbor in neighbors:
            neighbor = neighbor.replace('users/', '')
            verifications = set([v['name'] for v in db['verifications'].find({'user': neighbor})])
            if 'CallJoined' not in verifications:
                db['verifications'].insert({
                    'name': 'CallJoined',
                    'user': neighbor,
                    'timestamp': int(time.time() * 1000)
                })
                print('user: {}\tverification: CallJoined'.format(neighbor))

    verifiedCount = db['verifications'].find({'name': 'CallJoined'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
