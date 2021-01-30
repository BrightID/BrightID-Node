import time
from arango import ArangoClient
from . import utils
import config


def verify(block):
    print('BRIGHTID')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    verifieds = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'SeedConnected'
                AND v.rank > 0
                AND v.block == @block
            RETURN v.user
    ''', bind_vars={'block': block})

    batch_db = db.begin_batch_execution(return_result=True)
    verifications = batch_db.collection('verifications')
    for i, verified in enumerate(verifieds):
        verifications.insert({
            'name': 'BrightID',
            'user': verified,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('BrightID', verified)
        })
        if i % 1000 == 0:
            batch_db.commit()
            batch_db = db.begin_batch_execution(return_result=True)
            verifications = batch_db.collection('verifications')
    batch_db.commit()

    verifiedCount = db['verifications'].find({
        'name': 'BrightID', 'block': block}).count()
    print(f'verifieds: {verifiedCount}\n')
