import os
import time
import shutil
import socket
import traceback
from datetime import datetime
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
verifiers = {
    'SeedConnected': seed_connected,
    'SeedConnectedWithFriend': seed_connected_with_friend,
    'Yekta': yekta,
    'BrightID': brightid,
    'DollarForEveryone': dollar_for_everyone
}


def process(block):
    for verification_name in verifiers:
        try:
            verifiers[verification_name].verify(block)
        except Exception as e:
            print(f'Error in verifier: {e}')
            traceback.print_exc()


def main():
    while True:
        snapshots = [fname for fname in os.listdir(
            config.SNAPSHOTS_PATH) if fname.endswith('_fnl')]
        if len(snapshots) == 0:
            time.sleep(1)
            continue
        snapshots.sort(key=lambda fname: int(
            fname.strip('dump_').strip('_fnl')))
        fname = os.path.join(config.SNAPSHOTS_PATH, snapshots[0])
        print(
            f"{str(datetime.now()).split('.')[0]} - processing {fname} started ...")

        # restore snapshot
        os.system(
            f"arangorestore --server.username 'root' --server.password '' --server.database snapshot --create-database true --create-collection true --import-data true --input-directory {fname}")

        block = int(snapshots[0].strip('dump_').strip('_fnl'))
        process(block)
        update_apps_verification(block)
        update_verifications_state(block)
        # remove the snapshot file
        shutil.rmtree(fname, ignore_errors=True)
        print(
            f"{str(datetime.now()).split('.')[0]} - processing {fname} completed")


def update_apps_verification(block):
    print('Check the users are verified for the apps')
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
    if counter % 1000 != 0:
        batch_db.commit()


def update_verifications_state(block):
    variables = db.collection('variables')
    variables.update(
        {'_key': 'VERIFICATION_BLOCK', 'value': block})

    new_hash = {'block': block}
    for verification_name in verifiers:
        verifications = db['verifications'].find({'name': verification_name})
        message = ''.join(sorted([v['hash']
                                  for v in verifications])).encode('ascii')
        h = base64.b64encode(sha256(message).digest()).decode("ascii")
        new_hash[verification_name] = h.replace(
            '/', '_').replace('+', '-').replace('=', '')
    hashes = sorted(variables.get('VERIFICATIONS_HASHES')
                    ['hashes'], key=lambda k: k['block'])
    hashes.append(new_hash)
    if len(hashes) > 3:
        hashes.pop(0)
    variables.update({'_key': 'VERIFICATIONS_HASHES', 'hashes': hashes})

    # remove extra verifications
    db.aql.execute('''
        FOR v IN verifications
            FILTER  v.block < @wiping_border
            REMOVE { _key: v._key } IN verifications
        ''', bind_vars={'wiping_border': hashes[0]['block']})


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


if __name__ == '__main__':
    print('waiting for db ...')
    wait()
    print('db started')
    while True:
        try:
            main()
        except Exception as e:
            print(f'Error: {e}')
            traceback.print_exc()
            time.sleep(10)
