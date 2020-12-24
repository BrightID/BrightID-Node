import os
import socket
import time
import json
import binascii
import copy
from arango import ArangoClient
from web3 import Web3
import config

w3 = Web3(Web3.WebsocketProvider(config.INFURA_URL))
db = ArangoClient().db('_system')

def sendTransaction(data):
    nonce = w3.eth.getTransactionCount(config.ADDRESS, 'pending')
    tx = {
        'to': config.TO_ADDRESS,
        'value': 0,
        'gas': config.GAS,
        'gasPrice': config.GAS_PRICE,
        'nonce': nonce,
        'chainId': w3.eth.chainId,
        'data': data
    }
    signed = w3.eth.account.sign_transaction(tx, config.PRIVATE_KEY)
    tx = w3.eth.sendRawTransaction(signed.rawTransaction).hex()
    return tx

def main():
    for op in db.collection('operations').find({'state': 'init'}):
        d = copy.deepcopy(op)
        del d['_id']
        del d['_rev']
        del d['state']
        if op['v'] == 5:
            del d['_key']
            del d['hash']

        print(d)
        data = '0x'+binascii.hexlify(json.dumps(d).encode('utf-8')).decode('utf-8')
        sendTransaction(data)
        op['state'] = 'sent'
        db.update_document(op)

def wait():
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 8529))
        sock.close()
        if result != 0:
            print('db is not running yet')
            continue
        collections = [c['name'] for c in db.collections()]
        if 'operations' not in collections:
            print('operations collection is not created yet')
            continue
        return

if __name__ == '__main__':
    print('waiting for db ...')
    wait()
    print('sender started ...')
    while True:
        try:
            main()
            time.sleep(1)
        except Exception as e:
            print(f'Error: {e}')
            time.sleep(10)
            print('sender started ...')
