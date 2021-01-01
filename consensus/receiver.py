import os
import time
import json
import binascii
import base64
import hashlib
import zipfile
import requests
from arango import ArangoClient
from web3 import Web3
from web3.middleware import geth_poa_middleware
import config

db = ArangoClient().db('_system')
w3 = Web3(Web3.WebsocketProvider(config.INFURA_URL))
if config.INFURA_URL.count('rinkeby') > 0 or config.INFURA_URL.count('idchain') > 0:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)


def hash(op):
    op = {k: op[k] for k in op if k not in (
        'sig', 'sig1', 'sig2', 'hash', 'blockTime')}
    if op['name'] == 'Set Signing Key':
        del op['id1']
        del op['id2']
    message = json.dumps(op, sort_keys=True, separators=(',', ':'))
    m = hashlib.sha256()
    m.update(message.encode('ascii'))
    h = base64.b64encode(m.digest()).decode('ascii')
    return h.replace('+', '-').replace('/', '_').replace('=', '')


def process(data, block_timestamp):
    try:
        data = bytes.fromhex(data.strip('0x')).decode('utf-8')
        op = json.loads(data)
        op['blockTime'] = block_timestamp * 1000
        r = requests.put(config.APPLY_URL.format(
            v=op['v'], hash=hash(op)), json=op)
        print(op)
        print(r.json())
    except Exception as e:
        print(data.encode('utf-8'), e)


def save_snapshot(block):
    fname = config.SNAPSHOTS_PATH.format(block)
    zf = zipfile.ZipFile(fname + '.tmp', mode='w')
    dir_path = os.path.dirname(os.path.realpath(__file__))
    COLLECTIONS_FILE = os.path.join(dir_path, 'collections.json')
    os.system('rm /tmp/scorerDump -rf')
    os.system(f'arangodump --overwrite true --compress-output false --server.password "" --output-directory "/tmp/scorerDump" --maskings {COLLECTIONS_FILE}')
    for root, dirs, files in os.walk('/tmp/scorerDump'):
        for file in files:
            zf.write(os.path.join(root, file), file)
    zf.close()
    os.rename(fname + '.tmp', fname)


def main():
    variables = db.collection('variables')
    if variables.has('LAST_BLOCK'):
        last_block = variables.get('LAST_BLOCK')['value']
    else:
        last_block = w3.eth.getBlock('latest').number
        variables.insert({
            '_key': 'LAST_BLOCK',
            'value': last_block
        })

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
            last_block = block_number
            variables.update({'_key': 'LAST_BLOCK', 'value': last_block})


if __name__ == '__main__':
    while True:
        try:
            print('receiver started ...')
            main()
        except Exception as e:
            print(f'Error: {e}')
            time.sleep(10)
