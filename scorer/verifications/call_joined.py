from arango import ArangoClient
import time

BRIGHTID_CALLS = {'BrightID East': 'w4dNg2yUSuuMN_SfPBmqTbdNhk_nsFgwoO36ZUcDt88',
                  'BrightID West': '-z6lbLFK4yxj1YmrUz7dYttceEg1XWZRoD_V8xE8qC0'}


def verify():
    print('CALL JOINED')
    db = ArangoClient().db('_system')

    for group in BRIGHTID_CALLS.values():
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


if __name__ == '__main__':
    verify()
