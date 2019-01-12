import sys
import os
from arango import ArangoClient
from db_config import *


def label_seed_groups(input_file, overwrite=True):
    client = ArangoClient()
    db = client.db(DB_NAME, username=DB_USER, password=DB_PASS)
    groups = db.collection('groups')
    with open(input_file, 'rb') as f:
        seeds = f.read().strip().split('\n')
    for group in groups:
        if group['_key'] in seeds:
            db['groups'].update({'_key': group['_key'], 'seed': True})
        elif overwrite and group.has_key('seed') and group['seed']:
            db['groups'].update({'_key': group['_key'], 'seed': False})


if __name__ == '__main__':
    if not os.path.exists(sys.argv[1]):
        print("%s doesn't exists!")
    else:
        label_seed_groups(sys.argv[1])
