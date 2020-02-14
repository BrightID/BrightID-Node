import uuid
from web3 import Web3, HTTPProvider
import config

w3 = Web3(HTTPProvider(config.INFURA_URL))
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

if __name__ == '__main__':
    for i in range(100):
        sendTransaction(uuid.uuid4().hex*10)
        print(i)