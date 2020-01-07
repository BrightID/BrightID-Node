import os
from eth_keys import keys
from eth_utils import decode_hex

os.environ['WEB3_INFURA_PROJECT_ID'] = ''
PRIVATE_KEY = ''
ADDRESS = keys.PrivateKey(decode_hex(PRIVATE_KEY)).public_key.to_checksum_address()

GAS = 50000
GAS_PRICE = 25*10**9
TO_ADDRESS = '0x0000000000000000000000000000000000000000'

dir_path = os.path.dirname(os.path.realpath(__file__))
LAST_BLOCK_FILE = os.path.join(dir_path, 'last_block')
CONFIRM_NUM = 2
FIRST_BLOCK = 15602090
