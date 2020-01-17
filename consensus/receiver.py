import os
import time
import json
import binascii
import base64
import hashlib
import config
import zipfile
import requests 
from arango import ArangoClient
from web3.auto.infura.kovan import w3

db = ArangoClient().db('_system')

def process(data):
    try:
        data = bytes.fromhex(data.strip('0x')).decode('utf-8')
        op = json.loads(data)
    except ValueError as e:
        return False
    url = 'http://localhost:8529/_db/_system/apply/operations'
    r = requests.put(url, json=op)
    print(op)
    print(r.json())

    assert r.json().get('success') == True

def save_state(block):
    url = 'http://localhost:8529/_api/replication/dump?batchId={}&collection={}&chunkSize={}'
    batch = db.replication.create_dump_batch(ttl=1000)
    zf = zipfile.ZipFile(config.SNAPSHOTS_PATH.format(block), mode='w')
    for collection in ('users', 'groups', 'usersInGroups', 'connections'):
        # fixme: what if the collection size be more than 1GB?
        r = requests.get(url.format(batch['id'], collection, 10**9))
        zf.writestr('dump/{}_{}.data.json'.format(collection, batch['id']), r.text)
    zf.close()
    db.replication.delete_dump_batch(batch['id'])

def main():
    with open(config.LAST_BLOCK_FILE) as f:
        last_block = int(f.read())

    while True:
        current_block = w3.eth.getBlock('latest').number
        for block in range(last_block+1, current_block-config.CONFIRM_NUM+1):
            print('processing block {}'.format(block))
            for i, tx in enumerate(w3.eth.getBlock(block, True)['transactions']):
                if tx['to'] and tx['to'].lower() == config.TO_ADDRESS.lower():
                    process(tx['input'])
            if block % config.SAVE_STATE_PERIOD == 0:
                save_state(block)
            last_block = block
            with open(config.LAST_BLOCK_FILE, 'w') as f:
                f.write(str(last_block))

        time.sleep(5)

if __name__ == '__main__':
    print('receiver started ...')
    main()
