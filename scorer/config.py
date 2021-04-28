import os

SNAPSHOTS_PATH = "/snapshots"
if 'INIT_BRIGHTID_DB' in os.environ:
    for fname in os.listdir(SNAPSHOTS_PATH):
        fpath = os.path.join(SNAPSHOTS_PATH, fname)
        os.remove(fpath)

BN_ARANGO_PROTOCOL = os.environ['BN_ARANGO_PROTOCOL']
BN_ARANGO_HOST = os.environ['BN_ARANGO_HOST']
BN_ARANGO_PORT = int(os.environ['BN_ARANGO_PORT'])
ARANGO_SERVER = f'{BN_ARANGO_PROTOCOL}://{BN_ARANGO_HOST}:{BN_ARANGO_PORT}'
