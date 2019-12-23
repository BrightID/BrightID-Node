import os
import time
import json
import binascii
import config
from web3.auto.infura.kovan import w3
from pyArango.connection import *

db = Connection()['_system']
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
    aql = "FOR op IN operations FILTER op.state == 'init' RETURN op"
    res = db.AQLQuery(aql)
    for op in res:
        d = op.getStore()
        del d['_id']
        del d['_rev']
        print(d)
        data = '0x'+binascii.hexlify(json.dumps(d).encode('utf-8')).decode('utf-8')
        sendTransaction(data)
        op['state'] = 'sent'
        op.save()

if __name__ == '__main__':
    while True:
        main()
        time.sleep(1)
    