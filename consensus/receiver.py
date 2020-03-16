import os
import time
import json
import binascii
import base64
import hashlib
import zipfile
import requests
from arango import ArangoClient
from arango.exceptions import DocumentGetError
from web3 import Web3, HTTPProvider
from web3.middleware import geth_poa_middleware
import config

w3 = Web3(HTTPProvider(config.INFURA_URL))
if config.INFURA_URL.count('rinkeby') > 0:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
db = ArangoClient().db('_system')

def process(data):
    try:
        data = bytes.fromhex(data.strip('0x')).decode('utf-8')
        op = json.loads(data)
    except ValueError as e:
        return False
    if 'v' not in op:
        op['v'] = 3
    r = requests.put(config.APPLY_URL.format(v=op['v'], hash=op['_key']), json=op)
    print(op)
    print(r.json())
    assert r.json().get('success') == True

def save_snapshot(block):
    batch = db.replication.create_dump_batch(ttl=1000)
    fname = config.SNAPSHOTS_PATH.format(block)
    zf = zipfile.ZipFile(fname+'.tmp', mode='w')
    for collection in ('users', 'groups', 'usersInGroups', 'connections'):
        params = {'batchId': batch['id'], 'collection': collection, 'chunkSize': config.MAX_COLLECTION_SIZE}
        r = requests.get(config.DUMP_URL, params=params)
        zf.writestr('dump/{}_{}.data.json'.format(collection, batch['id']), r.text)
    zf.close()
    os.rename(fname+'.tmp', fname)
    db.replication.delete_dump_batch(batch['id'])

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

        if current_block>last_block:
            # Here we should go to process the block imediately, but there seems
            # to be a bug in getBlock that cause error when we get the transactions
            # instantly. This delay is added to avoid that error.
            # When error is raised, the file will run again and no bad problem occur.
            time.sleep(3)

        for block in range(last_block+1, current_block+1):
            print('processing block {}'.format(block))
            for i, tx in enumerate(w3.eth.getBlock(block, True)['transactions']):
                if tx['to'] and tx['to'].lower() == config.TO_ADDRESS.lower():
                    process(tx['input'])
            if block % config.SNAPSHOTS_PERIOD == 0:
                save_snapshot(block)
            last_block = block
            variables.update({'_key': 'LAST_BLOCK', 'value': last_block})

if __name__ == '__main__':
    print('receiver started ...')
    main()
