import time
from arango import ArangoClient
from . import utils
import config


def verify(block):
    print('SOCIAL RECOVERY SETUP')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
    verifieds = snapshot_db.aql.execute('''
        FOR c IN connections
            FILTER c.level == 'recovery'
            COLLECT user = c._from WITH COUNT INTO length
            Filter length > 2
            RETURN REGEX_REPLACE(user, 'users/', '')
    ''')

    batch_db = db.begin_batch_execution(return_result=True)
    verifications = batch_db.collection('verifications')
    i = 0
    for verified in verifieds:
        i += 1
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

    print(f'verifieds: {i}\n')
