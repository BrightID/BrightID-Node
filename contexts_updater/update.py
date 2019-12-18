from web3 import Web3, HTTPProvider
from pyArango.connection import Connection
import config

db = Connection()['_system']
w3 = Web3(HTTPProvider(config.INFURA_URL))

sp_contract = w3.eth.contract(
    address=config.SP_ADDRESS,
    abi=config.SP_ABI)

def str2bytes32(s):
    assert len(s) <= 32
    padding = (2 * (32 - len(s))) * '0'
    return (bytes(s, 'utf-8')).hex() + padding

def context_balance(contextName):
    b_contextName = str2bytes32(contextName)
    func = sp_contract.functions.totalContextBalance(
        b_contextName)
    balance = func.call({
        'from': config.ETH_CALL_SENDER,
    })
    return balance

def main():
    contexts = db['contexts'].fetchAll()
    result = {}
    for context in contexts:
        context['totalSponsorships'] = context_balance(context['_key'])
        print(context['_key'], context['totalSponsorships'])
        context.save()

if __name__ == '__main__':
    main()