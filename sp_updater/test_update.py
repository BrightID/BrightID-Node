import os
os.environ['BN_SP_UPDATER_BRIGHTID_ADDRESS'] = '0x9A3c23329a02478AAD82383ca5DF419c6c2Ac623'
os.environ['BN_SP_UPDATER_SP_ADDRESS'] = '0xFB32926d0A1e2082D12426B2854cb0c945AAF7c6'
os.environ['BN_SP_UPDATER_INFURA_URL'] = 'wss://rinkeby.infura.io/ws/v3/6a6d1dfc4c414b22ae569334e21ceb76'

from eth_keys import keys
import unittest
import random
import update
import string
import time


class TestUpdate(unittest.TestCase):

    def __init__(self, *args, **kwargs):
        super(TestUpdate, self).__init__(*args, **kwargs)
        self.idsAsHex = True
        self.GAS = 500 * 10**3
        self.GAS_PRICE = 5 * 10**9
        self.PRIVATE_KEY = ''
        self.CONTEXT = ''.join(random.choices(string.ascii_uppercase, k=5))
        if self.idsAsHex:
            self.CONTEXT_ID = update.w3.eth.account.create(
                'SIFTALFJAFJMOHSEN').address.lower()
        else:
            self.CONTEXT_ID = ''.join(
                random.choices(string.ascii_uppercase, k=15))
        self.USER = 'v7vS3jEqXazNUWj-5QXmrBL8x5XCp3EksF7uVGlijll'

        self.variables = update.db.collection('variables')
        self.users = update.db.collection('users')
        self.contexts = update.db.collection('contexts')
        self.sponsorships = update.db.collection('sponsorships')

    def setUp(self):
        self.DB_LB = self.variables.get('LAST_BLOCK_LOG')['value']
        self.contexts.insert({
            '_key': self.CONTEXT,
            'ethName': self.CONTEXT,
            'collection': self.CONTEXT,
            'verification': self.CONTEXT,
            'totalSponsorships': 2,
            'idsAsHex': self.idsAsHex
        })

        self.users.insert({
            '_key': self.USER,
            'verifications': [self.CONTEXT],
        })

        context_collection = update.db.create_collection(self.CONTEXT)
        context_collection.insert({
            'user': self.USER,
            'contextId': self.CONTEXT_ID,
            'timestamp': int(time.time())
        })

    def tearDown(self):
        try:
            self.contexts.delete(self.CONTEXT)
        except:
            pass
        try:
            self.users.delete(self.USER)
        except:
            pass
        try:
            update.db.delete_collection(self.CONTEXT)
        except:
            pass
        try:
            r = self.sponsorships.find(
                {'_from': 'users/{}'.format(self.USER)}).batch()[0]
            self.sponsorships.delete(r['_key'])
        except:
            pass
        self.variables.update({
            '_key': 'LAST_BLOCK_LOG',
            'value': self.DB_LB
        })

    def pad_left_address(self, address):
        return '0x' + 24 * '0' + address[2:]

    def priv2addr(self, private_key):
        pk = keys.PrivateKey(bytes.fromhex(private_key))
        return pk.public_key.to_checksum_address()

    def send_transaction(self, func):
        transaction = func.buildTransaction({
            'nonce': update.w3.eth.getTransactionCount(
                self.priv2addr(self.PRIVATE_KEY)),
            'from': self.priv2addr(self.PRIVATE_KEY),
            'value': 0,
            'gas': self.GAS,
            'gasPrice': self.GAS_PRICE
        })
        signed = update.w3.eth.account.sign_transaction(
            transaction, self.PRIVATE_KEY)
        raw_transaction = signed.rawTransaction.hex()
        tx_hash = update.w3.eth.sendRawTransaction(raw_transaction).hex()
        rec = update.w3.eth.waitForTransactionReceipt(tx_hash)
        return {'status': rec['status'], 'tx_hash': tx_hash}

    def add_context(self, context):
        func = update.brightid_contract.functions.addContext(context)
        self.send_transaction(func)

    def sponsor(self, context, context_id):
        func = update.brightid_contract.functions.sponsor(context, context_id)
        self.send_transaction(func)

    def test_context_balance(self):
        self.assertNotEqual(update.context_balance('ethereum'), 0)
        self.assertEqual(update.context_balance('Siftal'), 0)

    def test_sponsor_requests(self):
        self.add_context(update.str2bytes32(self.CONTEXT))
        lb = update.w3.eth.getBlock('latest').number
        self.sponsor(update.str2bytes32(
            self.CONTEXT), self.pad_left_address(self.CONTEXT_ID) if self.idsAsHex else update.str2bytes32(self.CONTEXT_ID))

        time.sleep(60)  # Waiting
        self.variables.update({
            '_key': 'LAST_BLOCK_LOG',
            'value': lb - 1
        })
        update.check_sponsor_requests()
        self.assertFalse(self.sponsorships.find(
            {'_from': 'users/{}'.format(self.USER)}).empty())


if __name__ == '__main__':
    unittest.main()
