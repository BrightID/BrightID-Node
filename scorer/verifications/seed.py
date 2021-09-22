from arango import ArangoClient
import time
from . import utils
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')


def verify(block):
    print('SEED')

    seeds = snapshot_db.aql.execute('''
        FOR g in groups
            FILTER g.seed == true
            FOR ug in usersInGroups
                FILTER ug._to == g._id
                RETURN DISTINCT ug._from
    ''')

    batch_db = db.begin_batch_execution(return_result=True)
    batch_col = batch_db.collection('verifications')
    counter = 0
    for s in seeds:
        seed = s.replace('users/', '')
        batch_col.insert({
            'name': 'Seed',
            'user': seed,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('Seed', seed)
        })
        counter += 1
        if counter % 1000 == 0:
            batch_db.commit()
            batch_db = db.begin_batch_execution(return_result=True)
            batch_col = batch_db.collection('verifications')
    batch_db.commit()

    verifiedCount = db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'Seed'
                AND v.block == @block
            RETURN v
    ''', bind_vars={'block': block}, count=True).count()
    print(f'verifications: {verifiedCount}\n')
