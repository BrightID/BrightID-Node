import time
from arango import ArangoClient
from . import utils
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']


def verify(block):
    print('HAS RECOVERY CONNECTIONS')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')

    verifieds = snapshot_db.aql.execute('''
        FOR u IN users
            LET recoveryConnections = LENGTH(
                FOR c IN connections
                    FILTER c._from == u._id AND c.level == 'recovery'
                    RETURN c
            )
            FILTER recoveryConnections > 2
            RETURN u._key
    ''')
    for verified in verifieds:
        db['verifications'].insert({
            'name': 'HasRecoveryConnections',
            'user': verified,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('HasRecoveryConnections', verified)
        })

    verifiedCount = db['verifications'].find(
        {'name': 'HasRecoveryConnections', 'block': block}).count()
    print(f'verifieds: {verifiedCount}\n')
