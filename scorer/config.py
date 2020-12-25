import os

SNAPSHOTS_PATH = "/snapshots"
ARANGO_SERVER = os.environ['BN_ARANGO_PROTOCOL'] + '://' + os.environ['BN_ARANGO_HOST'] + ':' + os.environ['BN_ARANGO_PORT']
