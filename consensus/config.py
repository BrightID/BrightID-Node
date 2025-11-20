import os
import hashlib
from eth_keys import keys
from eth_utils import decode_hex

## following variables should be removed in the next update ##
INFURA_URL = os.environ["BN_CONSENSUS_INFURA_URL"]
PRIVATE_KEY = os.environ.get("BN_CONSENSUS_PRIVATE_KEY")
SEED = os.environ.get("BN_SEED")
if not PRIVATE_KEY and SEED:
    PRIVATE_KEY = hashlib.sha256(SEED.encode("utf-8")).hexdigest()
ADDRESS = (
    keys.PrivateKey(decode_hex(PRIVATE_KEY)).public_key.to_checksum_address()
    if PRIVATE_KEY
    else ""
)
GAS = int(os.environ["BN_CONSENSUS_GAS"])
GAS_PRICE = int(os.environ["BN_CONSENSUS_GAS_PRICE"])
TO_ADDRESS = os.environ["BN_CONSENSUS_TO_ADDRESS"]
DEPRECATED_TO_ADDRESS = "0x0000000000000000000000000000000000000007"
IDCHAIN_RPC_URL = os.environ["BN_CONSENSUS_IDCHAIN_RPC_URL"]
SNAPSHOTS_PERIOD = os.environ["BN_CONSENSUS_SNAPSHOTS_PERIOD"]
##############################################################

NETWORK = os.environ["BN_CONSENSUS_NETWORK"]
TOPIC_ID = os.environ["BN_CONSENSUS_TOPIC_ID"]

OPERATOR_ID = os.environ["BN_CONSENSUS_OPERATOR_ID"]
OPERATOR_KEY = os.environ["BN_CONSENSUS_OPERATOR_KEY"]
MIRROR_NODE_URL = os.environ["BN_CONSENSUS_MIRROR_NODE_URL"]

MAX_DATA_SIZE = int(os.environ["BN_CONSENSUS_MAX_DATA_SIZE"])

SNAPSHOTS_PERIOD_SECONDS = int(os.environ["BN_CONSENSUS_SNAPSHOTS_PERIOD_SECONDS"])
SNAPSHOTS_PATH = "/snapshots/dump_{}"

BN_ARANGO_PROTOCOL = os.environ["BN_ARANGO_PROTOCOL"]
BN_ARANGO_HOST = os.environ["BN_ARANGO_HOST"]
BN_ARANGO_PORT = int(os.environ["BN_ARANGO_PORT"])
ARANGO_SERVER = f"{BN_ARANGO_PROTOCOL}://{BN_ARANGO_HOST}:{BN_ARANGO_PORT}"

APPLY_URL = ARANGO_SERVER + os.environ["BN_CONSENSUS_APPLY_URL"]
DUMP_URL = ARANGO_SERVER + os.environ["BN_CONSENSUS_DUMP_URL"]
