import os
import time
import json
import binascii
import copy
import config
from web3.auto.infura.kovan import w3
from arango import ArangoClient

db = ArangoClient().db('_system')
nonce = w3.eth.getTransactionCount(config.ADDRESS)

def sendTransaction(data):
    global nonce
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
    nonce += 1
    return tx

def main():
    for op in db.collection('operations').find({'state': 'init'}):
        d = copy.deepcopy(op)
        del d['_id']
        del d['_rev']
        print(d)
        data = '0x'+binascii.hexlify(json.dumps(d).encode('utf-8')).decode('utf-8')
        sendTransaction(data)
        op['state'] = 'sent'
        db.update_document(op)

if __name__ == '__main__':
    print('sender started ...')
    while True:
        main()
        time.sleep(1)
    