import os
import socket
import time
import shutil
import traceback
from arango import ArangoClient
from hashlib import sha256
import base64
import config
import verifications

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
variables = db.collection('variables')
verifiers = {
    'SeedConnected': verifications.seed_connected,
    'SeedConnectedWithFriend': verifications.seed_connected_with_friend,
    'Yekta': verifications.yekta,
    'BrightID': verifications.brightid,
    'DollarForEveryone': verifications.dollar_for_everyone,
    'SocialRecoverySetup': verifications.social_recovery_setup,
    'apps': verifications.apps,
}


def update_verifications_hashes(block):
    new_hashes = {}
    verifications_names = [v for v in verifiers if v != 'apps']
    for v in verifications_names:
        verifications = db['verifications'].find({'name': v, 'block': block})
        hashes = [v.get('hash', '') for v in verifications]
        message = ''.join(sorted(hashes)).encode('ascii')
        h = base64.b64encode(sha256(message).digest()).decode("ascii")
        new_hashes[v] = h.replace(
            '/', '_').replace('+', '-').replace('=', '')
    hashes = variables.get('VERIFICATIONS_HASHES')['hashes']
    hashes[block] = new_hashes
    # store hashes for only last 2 blocks
    to_keep = sorted(hashes.keys())[-2:]
    hashes = {block: hashes[block] for block in hashes if block in to_keep}
    variables.update({'_key': 'VERIFICATIONS_HASHES', 'hashes': hashes})


def remove_verifications_before(block):
    print(f'Removing verifications with block smaller than {block}')
    db.aql.execute('''
        FOR v IN verifications
            FILTER  v.block < @remove_border
            REMOVE { _key: v._key } IN verifications
        ''', bind_vars={'remove_border': block})


def process(snapshot):
    get_time = lambda: time.strftime('%Y-%m-%d %H:%M:%S')
    get_block = lambda snapshot: int(snapshot.strip('dump_').strip('_fnl'))

    print(f'{get_time()} - processing {snapshot} started ...')
    # restore snapshot
    fname = os.path.join(config.SNAPSHOTS_PATH, snapshot)
    res = os.system(f"arangorestore --server.username 'root' --server.password '' --server.endpoint 'tcp://{config.BN_ARANGO_HOST}:{config.BN_ARANGO_PORT}' --server.database snapshot --create-database true --create-collection true --import-data true --input-directory {fname}")
    assert res == 0, "restoring snapshot failed"

    block = get_block(snapshot)
    # If there are verifications for current block, it means there was
    # an error resulted in retrying the block. Remvoing these verifications
    # helps not filling database and preventing unknown problems that
    # having duplicate verifications for same block may result in
    db.aql.execute('''
        FOR v IN verifications
            FILTER  v.block == @block
            REMOVE { _key: v._key } IN verifications
        ''', bind_vars={'block': block})
    for v in verifiers:
        verifiers[v].verify(block)

    update_verifications_hashes(block)
    last_block = variables.get('VERIFICATION_BLOCK')['value']
    # only keep verifications for this snapshot and previous one
    remove_verifications_before(last_block)
    variables.update({'_key': 'VERIFICATION_BLOCK', 'value': block})
    # remove the snapshot file
    shutil.rmtree(fname, ignore_errors=True)
    print(f'{get_time()} - processing {fname} completed')


def next_snapshot():
    is_final = lambda snapshot: snapshot.endswith('_fnl')
    get_block = lambda snapshot: int(snapshot.strip('dump_').strip('_fnl'))
    while True:
        snapshots = os.listdir(config.SNAPSHOTS_PATH)
        snapshots.sort(key=get_block)
        snapshot = next(filter(is_final, snapshots), None)
        if snapshot:
            return snapshot
        time.sleep(1)


def wait():
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(
            (config.BN_ARANGO_HOST, config.BN_ARANGO_PORT))
        sock.close()
        if result != 0:
            print('db is not running yet')
            continue
        # wait for ws to start upgrading foxx services and running setup script
        time.sleep(10)
        services = [service['name'] for service in db.foxx.services()]
        if 'apply' not in services or 'BrightID-Node' not in services:
            print('foxx services are not running yet')
            continue
        return


def main():
    print('waiting for db ...')
    wait()
    print('db started')
    while True:
        snapshot = next_snapshot()
        try:
            process(snapshot)
        except Exception as e:
            print(f'Error: {e}')
            traceback.print_exc()
            time.sleep(10)


if __name__ == '__main__':
    main()
