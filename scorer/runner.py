import time
import traceback
from datetime import datetime
from arango import ArangoClient
from config import *
from verifications import yekta
from verifications import brightid
from verifications import seed_connected
from verifications import dollar_for_everyone
from verifications import seed_connected_with_friend
from py_expression_eval import Parser

db = ArangoClient().db('_system')
verifications_docs = db.collection('verifications')

verifiers = [
    seed_connected,
    seed_connected_with_friend,
    yekta,
    brightid,
    dollar_for_everyone
]


def process(fname, past_block, current_block):
    for verifier in verifiers:
        try:
            verifier.verify(fname, past_block, current_block)
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
        past_block = variables.get('VERIFICATION_BLOCK')['value']
        current_block = int(snapshots[0].strip('dump_').strip('.zip'))
        process(fname, past_block, current_block)
        update_apps_verification()
        variables.update(
            {'_key': 'VERIFICATION_BLOCK', 'value': current_block})
        wiping_border = past_block - (current_block - past_block)
        if os.path.exists(fname):
            os.remove(fname)
            db.aql.execute('''
                FOR v IN verifications
                    FILTER  v.block < @block
                    REMOVE { _key: v._key } IN verifications
                ''', bind_vars={'block': wiping_border})
        else:
            print(f'{fname} does not exist')
        print(
            '{} - processing {} completed'.format(str(datetime.now()).split('.')[0], fname))


def update_apps_verification():
    print('Check the users are verified for the apps')
    parser = Parser()
    apps_docs = db.collection('apps')
    apps = {app["_key"]: app['verification']
            for app in apps_docs if app.get('verification')}

    users_docs = db.collection('users')
    for user in users_docs:
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


def get_user_verification(user_key):
    results = {}
    verifications = filter(lambda v: v['user'] == user_key, verifications_docs)
    for v in verifications:
        results[v['name']] = True
        for k in v:
            if k in ['_key', '_id', '_rev', 'user', 'name']:
                continue
            results[f'{v["name"]}.{k}'] = v[k]
    return results


if __name__ == '__main__':
    while True:
        try:
            main()
        except Exception as e:
            print(f'Error: {e}')
            traceback.print_exc()
            time.sleep(10)
