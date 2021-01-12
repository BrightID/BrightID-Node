import time
from arango import ArangoClient
from . import utils
import config


def verify(block):
    print('BRIGHTID')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
    already_verifieds = {v['user'] for v in db['verifications'].find(
        {'name': 'BrightID'})}

    eligibles = snapshot_db.aql.execute('''
        FOR v in verifications
            FILTER v.name == 'SeedConnected'
                AND v.rank > 0
            RETURN v.user
    ''')

    for eligible in eligibles:
        if eligible in already_verifieds:
            already_verifieds.discard(eligible)
            continue

        db['verifications'].insert({
            'name': 'BrightID',
            'user': eligible,
            'block': block,
            'timestamp': int(time.time() * 1000),
            'hash': utils.hash('BrightID', eligible)
        })

    # revoking verification of the users that are not eligible anymore
    for ineligible in already_verifieds:
        db['verifications'].delete_match({
            'name': 'BrightID',
            'user': ineligible
        })

    verifiedCount = db['verifications'].find({'name': 'BrightID'}).count()
    print('verifieds: {}\n'.format(verifiedCount))
