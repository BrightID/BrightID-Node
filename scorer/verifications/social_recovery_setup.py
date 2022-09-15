import time
from arango import ArangoClient
from . import utils
import config

SEED_CONNECTION_LEVELS = ['just met', 'already known', 'recovery']


def verify(block):
    print('SOCIAL RECOVERY SETUP')
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

    batch_db = db.begin_batch_execution(return_result=True)
    verifications = batch_db.collection('verifications')
    for i, verified in enumerate(verifieds):
        verifications.insert({
            'name': 'SocialRecoverySetup',
            'user': verified,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('SocialRecoverySetup', verified)
        })
        if i % 1000 == 0:
            batch_db.commit()
            batch_db = db.begin_batch_execution(return_result=True)
            verifications = batch_db.collection('verifications')
    batch_db.commit()

    print(f'verifieds: {i + 1}\n')
