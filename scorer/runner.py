import os
import time
import shutil
import socket
import traceback
from arango import ArangoClient
from py_expression_eval import Parser
from hashlib import sha256
import base64
import config
from verifications import yekta
from verifications import brightid
from verifications import seed_connected
from verifications import dollar_for_everyone
from verifications import seed_connected_with_friend

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')
variables = db.collection('variables')
verifiers = {
    'SeedConnected': seed_connected,
    'SeedConnectedWithFriend': seed_connected_with_friend,
    'Yekta': yekta,
    'BrightID': brightid,
    'DollarForEveryone': dollar_for_everyone
}


def update_apps_verifications(block):
    print('Update verifications for apps')
    parser = Parser()
    apps = {app["_key"]: app['verification']
            for app in db['apps'] if app.get('verification')}
    batch_db = db.begin_batch_execution(return_result=True)
    batch_col = batch_db.collection('verifications')
    counter = 0
    for user in db['users']:
        verifications = {}
        for v in db['verifications'].find({'block': block, 'user': user['_key']}):
            verifications[v['name']] = True
            for k in v:
                if k in ['_key', '_id', '_rev', 'user', 'name']:
                    continue
                verifications[f'{v["name"]}.{k}'] = v[k]

        for app in apps:
            try:
                expr = parser.parse(apps[app])
                variables = expr.variables()
                verifications.update(
                    {k: False for k in variables if k not in verifications})
                verified = expr.evaluate(verifications)
            except:
                print('invalid verification expression')
                continue
            if verified:
                batch_col.insert({
                    'app': True,
                    'name': app,
                    'user': user,
                    'block': block,
                    'timestamp': int(time.time() * 1000)
                })
                counter += 1
                if counter % 1000 == 0:
                    batch_db.commit()
                    batch_db = db.begin_batch_execution(return_result=True)
                    batch_col = batch_db.collection('verifications')
    batch_db.commit()


def update_verifications_hashes(block):
    new_hash = {'block': block}
    for v in verifiers:
        verifications = db['verifications'].find({'name': v})
        hashes = [v.get('hash', '') for v in verifications]
        message = ''.join(sorted(hashes)).encode('ascii')
        h = base64.b64encode(sha256(message).digest()).decode("ascii")
        new_hash[v] = h.replace(
            '/', '_').replace('+', '-').replace('=', '')
    hashes = variables.get('VERIFICATIONS_HASHES')['hashes']
    hashes.sort(key=lambda h: h['block'])
    hashes.append(new_hash)
    if len(hashes) > 2:
        hashes.pop(0)
    variables.update({'_key': 'VERIFICATIONS_HASHES', 'hashes': hashes})


def remove_verifications_before(block):
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
    os.system(f"arangorestore --server.username 'root' --server.password '' --server.endpoint 'tcp://{config.BN_ARANGO_HOST}:{config.BN_ARANGO_PORT}' --server.database snapshot --create-database true --create-collection true --import-data true --input-directory {fname}")

    block = get_block(snapshot)
    for v in verifiers:
        try:
            verifiers[v].verify(block)
        except Exception as e:
            print(f'Error in verifier: {e}')
            traceback.print_exc()

    update_apps_verifications(block)
    update_verifications_hashes(block)
    variables.update({'_key': 'VERIFICATION_BLOCK', 'value': block})

    # remove verifications older than 2 blocks
    remove_verifications_before(block - 2)
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
