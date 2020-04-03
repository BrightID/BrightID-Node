import os
os.environ['BN_SP_UPDATER_BRIGHTID_ADDRESS'] = '0xC0c26604ad1ac7A1De0742D45956a5aa9A58a2E5'
os.environ['BN_SP_UPDATER_SP_ADDRESS'] = '0xFB32926d0A1e2082D12426B2854cb0c945AAF7c6'
os.environ['BN_SP_UPDATER_INFURA_URL'] = 'wss://rinkeby.infura.io/ws/v3/6a6d1dfc4c414b22ae569334e21ceb76'

from eth_keys import keys
import unittest
import random
import update
import string
import time

GAS = 500 * 10**3
GAS_PRICE = 5 * 10**9
PRIVATE_KEY = ''
CONTEXT = ''.join(random.choices(string.ascii_uppercase, k = 5))
CONTEXT_ID = ''.join(random.choices(string.ascii_uppercase, k = 15))
USER = 'v7vS3jEqXazNUWj-5QXmrBL8x5XCp3EksF7uVGlijll'
DB_LB = None

context_collection = update.db.collection(CONTEXT)
context_collection = None
variables = update.db.collection('variables')
users = update.db.collection('users')
contexts = update.db.collection('contexts')


def before():
    global context_collection, DB_LB

    DB_LB = variables.get('LAST_BLOCK_LOG')['value']

    contexts.insert({
        '_key': CONTEXT,
        'ethName': CONTEXT,
        'collection': CONTEXT,
        'verification': CONTEXT,
        'totalSponsorships': 2,
    })

    users.insert({
        '_key': USER,
        'verifications': [CONTEXT],
    })

    context_collection = update.db.create_collection(CONTEXT)
    context_collection.insert({
        'user': USER,
        'contextId': CONTEXT_ID,
        'timestamp': int(time.time())
    })


def after():
    try:
        contexts.delete(CONTEXT)
    except:
        pass
    try:
        users.delete(USER)
    except:
        pass
    try:
        update.db.delete_collection(CONTEXT)
    except:
        pass
    variables.update({
        '_key': 'LAST_BLOCK_LOG',
        'value': DB_LB
    })


def priv2addr(private_key):
    pk = keys.PrivateKey(bytes.fromhex(private_key))
    return pk.public_key.to_checksum_address()


def send_transaction(func, value, private_key):
    transaction = func.buildTransaction({
        'nonce': update.w3.eth.getTransactionCount(priv2addr(PRIVATE_KEY)),
        'from': priv2addr(PRIVATE_KEY),
        'value': value,
        'gas': GAS,
        'gasPrice': GAS_PRICE
    })
    signed = update.w3.eth.account.sign_transaction(transaction, private_key)
    raw_transaction = signed.rawTransaction.hex()
    tx_hash = update.w3.eth.sendRawTransaction(raw_transaction).hex()
    rec = update.w3.eth.waitForTransactionReceipt(tx_hash)
    return {'status': rec['status'], 'tx_hash': tx_hash}


def add_context(context):
    func = update.brightid_contract.functions.addContext(context)
    res = send_transaction(func, 0, PRIVATE_KEY)
    print(res)


def sponsor(context, context_id):
    func = update.brightid_contract.functions.sponsor(context, context_id)
    res = send_transaction(func, 0, PRIVATE_KEY)
    print(res)


class TestUpdate(unittest.TestCase):

    def test_context_balance(self):
        self.assertNotEqual(update.context_balance('ethereum'), 0)
        self.assertEqual(update.context_balance('Siftal'), 0)

    def test_sponsor_requests(self):
        before()
        add_context(update.str2bytes32(CONTEXT))
        sponsor(update.str2bytes32(CONTEXT), update.str2bytes32(CONTEXT_ID))

        time.sleep(60)  # Waiting
        lb = update.w3.eth.getBlock('latest').number
        variables.update({
            '_key': 'LAST_BLOCK_LOG',
            'value': lb - 100
        })
        update.check_sponsor_requests()
        self.assertFalse(update.db.collection('sponsorships').find(
            {'_from': 'users/{}'.format(USER)}).empty())
        after()


if __name__ == '__main__':
    try:
        unittest.main()
    except:
        after()
