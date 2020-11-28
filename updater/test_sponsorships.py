import os
os.environ['BN_UPDATER_SP_ADDRESS'] = '0xFB32926d0A1e2082D12426B2854cb0c945AAF7c6'
os.environ['BN_UPDATER_SP_INFURA_URL'] = ''

from eth_keys import keys
import unittest
import random
import sponsorships
import string
import time
from web3 import Web3
from web3.middleware import geth_poa_middleware


class TestUpdate(unittest.TestCase):

    def __init__(self, *args, **kwargs):
        super(TestUpdate, self).__init__(*args, **kwargs)
        self.IDS_AS_HEX = True
        self.GAS = 500 * 10**3
        self.GAS_PRICE = 5 * 10**9
        self.SPONSOR_EVENT_CONTRACT = '0xE8572C106662F7Da8D6734F99bADE6BAE33c5DB8'
        self.CONTRACT_ABI = '[{"anonymous": false,"inputs": [{"indexed": true,"internalType": "address","name": "addr","type": "address"}],"name": "Sponsor","type": "event"},{"inputs": [{"internalType": "address","name": "addr","type": "address"}],"name": "sponsor","outputs": [],"stateMutability": "nonpayable","type": "function"}]'
        self.PRIVATE_KEY = 'EEBED6AE74B73BE44F4706222344E1D90363F64DA2C31B58B29F7A39EB6BFB43'
        self.APP = ''.join(random.choices(string.ascii_uppercase, k=5))
        self.USER = 'v7vS3jEqXazNUWj-5QXmrBL8x5XCp3EksF7uVGlijll'
        self.WS_PROVIDER = 'wss://rinkeby.infura.io/ws/v3/588bb93634084be69f62f302a279d76f'
        self.w3 = Web3(Web3.WebsocketProvider(
            self.WS_PROVIDER, websocket_kwargs={'timeout': 60}))
        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        self.CONTEXT_ID = self.w3.eth.account.create(
            'SIFTALFJAFJMOHSEN').address.lower()
        self.variables = sponsorships.db.collection('variables')
        self.users = sponsorships.db.collection('users')
        self.apps = sponsorships.db.collection('apps')
        self.contexts = sponsorships.db.collection('contexts')
        self.sponsorships = sponsorships.db.collection('sponsorships')
        self.contract = self.w3.eth.contract(
            address=self.SPONSOR_EVENT_CONTRACT,
            abi=self.CONTRACT_ABI)
        self.testblocks = sponsorships.db.collection('testblocks')

        self.app = {
            '_key': self.APP,
            'ethName': self.APP,
            'collection': self.APP,
            'context': self.APP,
            'verification': self.APP,
            'wsProvider': self.WS_PROVIDER,
            'sponsorEventContract': self.SPONSOR_EVENT_CONTRACT,
            'totalSponsorships': 2,
            'idsAsHex': self.IDS_AS_HEX
        }
        self.context = {
            '_key': self.APP,
            'collection': self.APP,
            'verification': self.APP,
        }

    def setUp(self):
        self.apps.insert(self.app)
        self.contexts.insert(self.context)
        self.users.insert({
            '_key': self.USER,
            'verifications': [self.APP],
        })
        context_collection = sponsorships.db.create_collection(self.APP)
        context_collection.insert({
            'user': self.USER,
            'contextId': self.CONTEXT_ID,
            'timestamp': int(time.time())
        })
        self.testblocks.insert({
            'app': self.APP,
            'contextId': self.CONTEXT_ID,
            'action': 'sponsorship',
            'timestamp': int(time.time())
        })

    def tearDown(self):
        try:
            self.contexts.delete(self.APP)
        except:
            pass
        try:
            self.apps.delete(self.APP)
        except:
            pass
        try:
            self.users.delete(self.USER)
        except:
            pass
        try:
            sponsorships.db.delete_collection(self.APP)
        except:
            pass
        try:
            r = self.sponsorships.find(
                {'_from': 'users/{}'.format(self.USER)}).batch()[0]
            self.sponsorships.delete(r['_key'])
        except:
            pass
        try:
            self.variables.delete('LAST_BLOCK_LOG_{}'.format(self.APP))
        except:
            pass

    def priv2addr(self, private_key):
        pk = keys.PrivateKey(bytes.fromhex(private_key))
        return pk.public_key.to_checksum_address()

    def send_transaction(self, func):
        transaction = func.buildTransaction({
            'nonce': self.w3.eth.getTransactionCount(
                self.priv2addr(self.PRIVATE_KEY)),
            'from': self.priv2addr(self.PRIVATE_KEY),
            'value': 0,
            'gas': self.GAS,
            'gasPrice': self.GAS_PRICE
        })
        signed = self.w3.eth.account.sign_transaction(
            transaction, self.PRIVATE_KEY)
        raw_transaction = signed.rawTransaction.hex()
        tx_hash = self.w3.eth.sendRawTransaction(raw_transaction).hex()
        rec = self.w3.eth.waitForTransactionReceipt(tx_hash)
        return {'status': rec['status'], 'tx_hash': tx_hash}

    def sponsor(self, context_id):
        func = self.contract.functions.sponsor(context_id)
        self.send_transaction(func)

    def test_sponsors(self):
        # test the sponsor
        lb = self.w3.eth.getBlock('latest').number
        self.sponsor(self.w3.toChecksumAddress(self.CONTEXT_ID))

        # Waiting
        time.sleep(60)
        self.variables.insert({
            '_key': 'LAST_BLOCK_LOG_{}'.format(self.APP),
            'value': lb - 1
        })
        sponsorships.update()
        self.assertFalse(self.sponsorships.find(
            {'_from': 'users/{}'.format(self.USER)}).empty())
        self.assertTrue(self.testblocks.find(
            {'contextId': self.CONTEXT_ID}).empty())

if __name__ == '__main__':
    unittest.main()
