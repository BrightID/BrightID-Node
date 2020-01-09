import os
import time
import json
import binascii
import base64
import hashlib
import config
from web3.auto.infura.kovan import w3
import requests
  
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

def main():
    with open(config.LAST_BLOCK_FILE) as f:
        last_block = int(f.read())

    while True:
        current_block = w3.eth.getBlock('latest').number
        for block in range(last_block+1, current_block-config.CONFIRM_NUM):
            print('processing block {}'.format(block))
            for i, tx in enumerate(w3.eth.getBlock(block, True)['transactions']):
                if tx['to'] and tx['to'].lower() == config.TO_ADDRESS.lower():
                    process(tx['input'])
            last_block = block
            with open(config.LAST_BLOCK_FILE, 'w') as f:
                f.write(str(last_block))

        time.sleep(5)

if __name__ == '__main__':
    main()
