import os
import time
import socket
import json
import base64
import hashlib
import shutil
import requests
from arango import ArangoClient, errno
from web3 import Web3
from web3.middleware import geth_poa_middleware
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
w3 = Web3(Web3.WebsocketProvider(config.INFURA_URL))
if config.INFURA_URL.count('rinkeby') > 0 or config.INFURA_URL.count('idchain') > 0:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)


def hash(op):
    blockTime = op['blockTime']
    op = {k: op[k] for k in op if k not in (
        'sig', 'sig1', 'sig2', 'hash', 'blockTime')}
    if op['name'] == 'Set Signing Key' or op['name'] == 'Social Recovery':
        del op['id1']
        del op['id2']
    # in next release checking blockTime should be removed
    if op['name'] == 'Social Recovery' and op['v'] == 6 and blockTime > 1637380189000:
        del op['id1']
        del op['id2']
    message = json.dumps(op, sort_keys=True, separators=(',', ':'))
    m = hashlib.sha256()
    m.update(message.encode('ascii'))
    h = base64.b64encode(m.digest()).decode('ascii')
    return h.replace('+', '-').replace('/', '_').replace('=', '')


def process(data, block_timestamp):
    data_bytes = bytes.fromhex(data.strip('0x'))
    data_str = data_bytes.decode('utf-8', 'ignore')
    try:
        operations = json.loads(data_str)
    except ValueError as e:
        print('error in parsing operations', data_str)
        return
    for op in operations:
        if type(op) != dict or op.get('v') not in (5, 6) or 'name' not in op:
            print('invalid operation', op)
            continue
        op['blockTime'] = block_timestamp * 1000
        process_op(op)


def process_op(op):
    print(op)
    url = config.APPLY_URL.format(v=op['v'], hash=hash(op))
    r = requests.put(url, json=op)
    resp = r.json()
    print(resp)
    # resp is returned from PUT /operations handler
    if resp.get('state') == 'failed':
        if resp['result'].get('arangoErrorNum') == errno.CONFLICT:
            print('retry on conflict')
            return process_op(op)
    # resp is returned from arango not PUT /operations handler
    if resp.get('error'):
        raise Exception('Error from apply service')


def save_snapshot(block):
    dir_name = config.SNAPSHOTS_PATH.format(block)
    fnl_dir_name = f'{dir_name}_fnl'
    dir_path = os.path.dirname(os.path.realpath(__file__))
    collections_file = os.path.join(dir_path, 'collections.json')
    res = os.system(f'arangodump --overwrite true --compress-output false --server.password "" --server.endpoint "tcp://{config.BN_ARANGO_HOST}:{config.BN_ARANGO_PORT}" --output-directory {dir_name} --maskings {collections_file}')
    assert res == 0, "dumping snapshot failed"
    shutil.move(dir_name, fnl_dir_name)


def main():
    variables = db.collection('variables')
    last_block = variables.get('LAST_BLOCK')['value']

    while True:
        # This sleep is for not calling the ethereum node endpoint
        # for getting the last block number more than once per second
        time.sleep(1)
        current_block = w3.eth.getBlock('latest').number

        if current_block > last_block:
            # Here we should go to process the block imediately, but there seems
            # to be a bug in getBlock that cause error when we get the transactions
            # instantly. This delay is added to avoid that error.
            # When error is raised, the file will run again and no bad problem occur.
            time.sleep(3)

        for block_number in range(last_block + 1, current_block + 1):
            print('processing block {}'.format(block_number))
            block = w3.eth.getBlock(block_number, True)
            for i, tx in enumerate(block['transactions']):
                if tx['to'] and tx['to'].lower() in (config.TO_ADDRESS.lower(), config.DEPRECATED_TO_ADDRESS.lower()):
                    process(tx['input'], block.timestamp)
            if block_number % config.SNAPSHOTS_PERIOD == 0:
                save_snapshot(block_number)
                # PREV_SNAPSHOT_TIME is used by some verification
                # algorithms to filter connections that are made
                # after previous processed snapshot
                variables.update({'_key': 'PREV_SNAPSHOT_TIME', 'value': block['timestamp']})
            variables.update({'_key': 'LAST_BLOCK', 'value': block_number})
            last_block = block_number


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
        collections = [c['name'] for c in db.collections()]
        if 'apps' not in collections:
            print('apps collection is not created yet')
            continue
        apps = [app for app in db.collection('apps')]
        if len(apps) == 0:
            print('apps collection is not loaded yet')
            continue
        return


if __name__ == '__main__':
    while True:
        try:
            print('waiting for db ...')
            wait()
            print('receiver started ...')
            main()
        except Exception as e:
            print(f'Error: {e}')
            time.sleep(10)
