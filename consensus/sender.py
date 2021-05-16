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
db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')

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
    operations = []
    hashes = []
    for op in db.collection('operations').find({'state': 'init'}):
        ignore = ['_id', '_rev', 'state', '_key', 'hash']
        d = {k: op[k] for k in op if k not in ignore}
        if len(json.dumps(operations)) + len(json.dumps(d)) > config.MAX_DATA_SIZE:
            break
        hashes.append(op['hash'])
        operations.append(d)
        print(d)

    if not operations:
        return

    data = json.dumps(operations).encode('utf-8')
    data = '0x'+binascii.hexlify(data).decode('utf-8')
    sendTransaction(data)
    for i, op in enumerate(operations):
        db.collection('operations').update({'_key': hashes[i], 'state': 'sent'}, merge=True)

def wait():
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex((config.BN_ARANGO_HOST, config.BN_ARANGO_PORT))
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
