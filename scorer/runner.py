import time
import socket
import traceback
from datetime import datetime
from arango import ArangoClient
from config import *
from verifications import seed_connected
from verifications import brightid
from verifications import dollar_for_everyone
from verifications import yekta
from verifications import seed_connected_with_friend
from py_expression_eval import Parser

db = ArangoClient().db('_system')


def process(fname):
    for verifier in [seed_connected, seed_connected_with_friend, yekta, brightid, dollar_for_everyone]:
        try:
            verifier.verify(fname)
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
            SNAPSHOTS_PATH) if fname.endswith('.zip')]
        if len(snapshots) == 0:
            time.sleep(1)
            continue
        snapshots.sort(key=lambda fname: int(
            fname.strip('dump_').strip('.zip')))
        fname = os.path.join(SNAPSHOTS_PATH, snapshots[0])
        print(
            '{} - processing {} started ...'.format(str(datetime.now()).split('.')[0], fname))
        process(fname)
        update_apps_verification()
        block = int(snapshots[0].strip('dump_').strip('.zip'))
        variables.update({'_key': 'VERIFICATION_BLOCK', 'value': block})
        if os.path.exists(fname):
            os.remove(fname)
        else:
            print(f'{fname} does not exist')
        print(
            '{} - processing {} completed'.format(str(datetime.now()).split('.')[0], fname))


def update_apps_verification():
    print('Check the users are verified for the apps')
    parser = Parser()
    apps = {app["_key"]: app['verification']
            for app in db['apps'] if app.get('verification')}
    for user in db['users']:
        verifications = get_user_verification(user['_key'])
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
                    'timestamp': int(time.time() * 1000)
                })
            elif not verified and app in verifications:
                db['verifications'].delete_match({
                    'app': True,
                    'name': app,
                    'user': user['_key']
                })


def get_user_verification(user):
    verifications = {}
    for v in db['verifications'].find({'user': user}):
        verifications[v['name']] = True
        for k in v:
            if k in ['_key', '_id', '_rev', 'user', 'name']:
                continue
            verifications[f'{v["name"]}.{k}'] = v[k]
    return verifications


def wait():
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 8529))
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
