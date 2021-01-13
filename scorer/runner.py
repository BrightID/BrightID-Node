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
    variables = db.collection('variables')
    if not variables.has('VERIFICATION_BLOCK'):
        variables.insert({
            '_key': 'VERIFICATION_BLOCK',
            'value': 0
        })
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
        variables.update(
            {'_key': 'VERIFICATION_BLOCK', 'value': block})
        update_hashes(block)

        # remove the snapshot file
        if os.path.exists(fname):
            shutil.rmtree(fname)
        else:
            print(f'{fname} does not exist')
        print(
            f"{str(datetime.now()).split('.')[0]} - processing {fname} completed")


def update_apps_verification(block):
    all_verifications = {}
    for d in snapshot_db['verifications']:
        if d['user'] not in all_verifications:
            all_verifications[d['user']] = {}

        all_verifications[d['user']][d['name']] = True
        for k in d:
            if k in ['_key', '_id', '_rev', 'user', 'name']:
                continue
            all_verifications[d['user']][f'{d["name"]}.{k}'] = d[k]

    print('Check the users are verified for the apps')
    parser = Parser()

    apps = {app["_key"]: app['verification']
            for app in db['apps'] if app.get('verification')}
    for user in snapshot_db['users']:
        verifications = all_verifications.get(user['_key'], {})
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
            if verified and app not in verifications:
                db['verifications'].insert({
                    'app': True,
                    'name': app,
                    'user': user['_key'],
                    'block': block,
                    'timestamp': int(time.time() * 1000)
                })
            elif not verified and app in verifications:
                db['verifications'].delete_match({
                    'app': True,
                    'name': app,
                    'user': user['_key']
                })


def update_hashes(block):
    variables = db.collection('variables')
    if not variables.has('VERIFICATIONS_HASHES'):
        variables.insert({
            '_key': 'VERIFICATIONS_HASHES',
            'hashes': []
        })
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
