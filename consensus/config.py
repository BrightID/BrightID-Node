import os
from eth_keys import keys
from eth_utils import decode_hex

INFURA_URL = os.environ['BN_CONSENSUS_INFURA_URL']
PRIVATE_KEY = os.environ.get('BN_CONSENSUS_PRIVATE_KEY')
ADDRESS = keys.PrivateKey(
    decode_hex(PRIVATE_KEY)
).public_key.to_checksum_address() if PRIVATE_KEY else ''


GAS = int(os.environ['BN_CONSENSUS_GAS'])
GAS_PRICE = int(os.environ['BN_CONSENSUS_GAS_PRICE'])
TO_ADDRESS = os.environ['BN_CONSENSUS_TO_ADDRESS']
DEPRECATED_TO_ADDRESS = '0x0000000000000000000000000000000000000007'

SNAPSHOTS_PERIOD = int(os.environ['BN_CONSENSUS_SNAPSHOTS_PERIOD'])
SNAPSHOTS_PATH = "/snapshots/dump_{}"

BN_ARANGO_PROTOCOL = os.environ['BN_ARANGO_PROTOCOL']
BN_ARANGO_HOST = os.environ['BN_ARANGO_HOST']
BN_ARANGO_PORT = int(os.environ['BN_ARANGO_PORT'])
ARANGO_SERVER = f'{BN_ARANGO_PROTOCOL}://{BN_ARANGO_HOST}:{BN_ARANGO_PORT}'

APPLY_URL = ARANGO_SERVER + os.environ['BN_CONSENSUS_APPLY_URL']
DUMP_URL = ARANGO_SERVER + os.environ['BN_CONSENSUS_DUMP_URL']
