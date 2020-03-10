import os
from eth_keys import keys
from eth_utils import decode_hex

INFURA_URL = os.environ['BN_CONSENSUS_INFURA_URL']
PRIVATE_KEY = os.environ['BN_CONSENSUS_PRIVATE_KEY']
ADDRESS = keys.PrivateKey(decode_hex(PRIVATE_KEY)).public_key.to_checksum_address()

GAS = int(os.environ['BN_CONSENSUS_GAS'])
GAS_PRICE = int(os.environ['BN_CONSENSUS_GAS_PRICE'])
TO_ADDRESS = os.environ['BN_CONSENSUS_TO_ADDRESS']

SNAPSHOTS_PERIOD = int(os.environ['BN_CONSENSUS_SNAPSHOTS_PERIOD'])
SNAPSHOTS_PATH = "/snapshots/dump_{}.zip"

APPLY_URL = os.environ['BN_CONSENSUS_APPLY_URL']
DUMP_URL = os.environ['BN_CONSENSUS_DUMP_URL']
MAX_COLLECTION_SIZE = os.environ['BN_CONSENSUS_MAX_COLLECTION_SIZE']