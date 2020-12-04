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

db = ArangoClient().db('_system')
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


if __name__ == '__main__':
    while True:
        try:
            main()
        except Exception as e:
            print(f'Error: {e}')
            traceback.print_exc()
            time.sleep(10)
