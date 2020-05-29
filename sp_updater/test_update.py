import os
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
        self.IDS_AS_HEX = True
        self.GAS = 500 * 10**3
        self.GAS_PRICE = 5 * 10**9
        self.CONTRACT_ADDRESS = '0xeFD4887faf909a5B0E5CA9FAA29aA4b9a0eC3046'
        self.CONTRACT_ABI = '[{"anonymous": false,"inputs": [{"indexed": true,"internalType": "address","name": "previousOwner","type": "address"},{"indexed": true,"internalType": "address","name": "newOwner","type": "address"}],"name": "OwnershipTransferred","type": "event"},{"anonymous": false,"inputs": [{"indexed": true,"internalType": "address","name": "addr","type": "address"}],"name": "Sponsor","type": "event"},{"anonymous": false,"inputs": [{"indexed": true,"internalType": "address","name": "addr","type": "address"}],"name": "Verified","type": "event"},{"anonymous": false,"inputs": [{"indexed": false,"internalType": "contract IERC20","name": "verifierToken","type": "address"}],"name": "VerifierTokenSet","type": "event"},{"inputs": [{"internalType": "address","name": "","type": "address"}],"name": "history","outputs": [{"internalType": "address","name": "","type": "address"}],"stateMutability": "view","type": "function"},{"inputs": [{"internalType": "address","name": "","type": "address"}],"name": "isRevoked","outputs": [{"internalType": "bool","name": "","type": "bool"}],"stateMutability": "view","type": "function"},{"inputs": [],"name": "owner","outputs": [{"internalType": "address","name": "","type": "address"}],"stateMutability": "view","type": "function"},{"inputs": [],"name": "renounceOwnership","outputs": [],"stateMutability": "nonpayable","type": "function"},{"inputs": [{"internalType": "contract IERC20","name": "_verifierToken","type": "address"}],"name": "setVerifierToken","outputs": [],"stateMutability": "nonpayable","type": "function"},{"inputs": [{"internalType": "address","name": "addr","type": "address"}],"name": "sponsor","outputs": [],"stateMutability": "nonpayable","type": "function"},{"inputs": [{"internalType": "address","name": "newOwner","type": "address"}],"name": "transferOwnership","outputs": [],"stateMutability": "nonpayable","type": "function"},{"inputs": [{"internalType": "address","name": "","type": "address"}],"name": "verifications","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"},{"inputs": [],"name": "verifierToken","outputs": [{"internalType": "contract IERC20","name": "","type": "address"}],"stateMutability": "view","type": "function"},{"inputs": [{"internalType": "bytes32","name": "context","type": "bytes32"},{"internalType": "address[]","name": "addrs","type": "address[]"},{"internalType": "uint8","name": "v","type": "uint8"},{"internalType": "bytes32","name": "r","type": "bytes32"},{"internalType": "bytes32","name": "s","type": "bytes32"}],"name": "verify","outputs": [],"stateMutability": "nonpayable","type": "function"}]'
        self.VERIFIER_TOKEN = '0xF6b23cD9187C991f3768410329b767E9D53e17Ce'
        # this account should have a verification token of the deployed BrightID contract at CONTRACT_ADDRESS
        self.PRIVATE_KEY = 'EEBED6AE74B73BE44F4706222344E1D90363F64DA2C31B58B29F7A39EB6BFB43'
        self.CONTEXT = ''.join(random.choices(string.ascii_uppercase, k=5))
        self.CONTEXT_ID = update.w3.eth.account.create(
            'SIFTALFJAFJMOHSEN').address.lower()
        self.USER = 'v7vS3jEqXazNUWj-5QXmrBL8x5XCp3EksF7uVGlijll'

        self.variables = update.db.collection('variables')
        self.users = update.db.collection('users')
        self.contexts = update.db.collection('contexts')
        self.sponsorships = update.db.collection('sponsorships')
        self.contract = update.w3.eth.contract(
            address=self.CONTRACT_ADDRESS,
            abi=self.CONTRACT_ABI)
        self.context = {
            '_key': self.CONTEXT,
            'ethName': self.CONTEXT,
            'collection': self.CONTEXT,
            'verification': self.CONTEXT,
            'contractAddress': self.CONTRACT_ADDRESS,
            'totalSponsorships': 2,
            'idsAsHex': self.IDS_AS_HEX
        }

    def setUp(self):
        self.DB_LB = self.variables.get('LAST_BLOCK_LOG')['value']
        self.contexts.insert(self.context)

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

    def sponsor(self, context_id):
        func = self.contract.functions.sponsor(context_id)
        self.send_transaction(func)

    def test_sp_updater(self):
        # test the context_balance
        self.assertNotEqual(update.context_balance('ethereum'), 0)
        self.assertEqual(update.context_balance('Siftal'), 0)

        # test the sponsor
        lb = update.w3.eth.getBlock('latest').number
        self.sponsor(update.w3.toChecksumAddress(self.CONTEXT_ID))

        # Waiting
        time.sleep(60)
        self.variables.update({
            '_key': 'LAST_BLOCK_LOG',
            'value': lb - 1
        })
        update.check_sponsor_requests()
        self.assertFalse(self.sponsorships.find(
            {'_from': 'users/{}'.format(self.USER)}).empty())


if __name__ == '__main__':
    unittest.main()
