from arango import ArangoClient
import time
from . import utils
import config
import requests
import json

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
snapshot_db = ArangoClient(hosts=config.ARANGO_SERVER).db('snapshot')

files = [
    {'url': 'https://explorer.brightid.org/history/bitu.json', 'rank': 'score'},
]


def verify(block):
    for file in files:
        try:
            f = requests.get(file['url'])
            verifieds = json.loads(f.content)
            print(verifieds[0].get('name', 'untitled').upper())
        except:
            print(f"Error in load verification's data from {file['url']}")
            return
        batch_db = db.begin_batch_execution(return_result=True)
        batch_col = batch_db.collection('verifications')
        counter = 0
        for v in verifieds:
            if 'user' not in v or 'name' not in v:
                continue
            v['block'] = block
            v['timestamp'] = int(time.time() * 1000)
            v['hash'] = utils.hash(v['name'], v['user'],
                                   v.get(file['rank'], ''))
            batch_col.insert(v)
            counter += 1
            if counter % 1000 == 0:
                batch_db.commit()
                batch_db = db.begin_batch_execution(return_result=True)
                batch_col = batch_db.collection('verifications')
        batch_db.commit()

        print(f'verifications: {counter}\n')
