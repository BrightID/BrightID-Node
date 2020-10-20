import os
import time
import json
import binascii
import base64
import hashlib
import zipfile
import requests
from arango import ArangoClient
from web3 import Web3
from web3.middleware import geth_poa_middleware
import config

db = ArangoClient().db('_system')
w3 = Web3(Web3.WebsocketProvider(config.INFURA_URL))
if config.INFURA_URL.count('rinkeby') > 0 or config.INFURA_URL.count('idchain') > 0:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
voting = w3.eth.contract(address=config.VOTING_ADDRESS, abi=config.VOTING_ABI)

def hash(op):
    op = {k: op[k] for k in op if k not in ('sig', 'sig1', 'sig2', 'hash')}
    if op['name'] == 'Set Signing Key':
        del op['id1']
        del op['id2']
    message = json.dumps(op, sort_keys=True, separators=(',', ':'))
    m = hashlib.sha256()
    m.update(message.encode('ascii'))
    h = base64.b64encode(m.digest()).decode('ascii')
    return h.replace('+', '-').replace('/', '_').replace('=', '')

def process(data):
    try:
        data = bytes.fromhex(data.strip('0x')).decode('utf-8')
        op = json.loads(data)
        if op['v'] == 4:
            h = op['_key']
        else:
            h = hash(op)
        r = requests.put(config.APPLY_URL.format(v=op['v'], hash=h), json=op)
    except Exception as e:
        print(data.encode('utf-8'), e)
        return False
    print(op)
    print(r.json())
    assert r.json().get('success') == True

def get_action(vote_id):
    vote = voting.functions.getVote(vote_id).call()
    text = voting.events.StartVote.createFilter(
        fromBlock="0x0",
        argument_filters={'voteId': vote_id}
    ).get_all_entries()[0].args.metadata
    sections = [s.strip() for s in text.split('|')]

    name = sections[0].lower() if len(sections) > 0 else None
    if name not in ['grant seed status', 'revoke seed status']:
        print('{} is an invalid action'.format(name))
        return None
    if ((name == 'grant seed status' and len(sections) != 4) or
        (name == 'revoke seed status' and len(sections) != 3)):
        print('"{}" is invalid action'.format(text))
        return None

    group = sections[1]
    if not db.collection('groups').get(group):
        print('group not found: {}'.format(group))
        return None

    region = sections[2] if name == 'grant seed status' else None
    info = sections[3] if name == 'grant seed status' else None
    return {'name': name, 'group': group, 'region': region, 'info': info}

def update_seed_groups(from_block, to_block):
    print('Updating Seed Groups')
    entries = voting.events.ExecuteVote.createFilter(fromBlock=from_block).get_all_entries()
    in_range = lambda entry: from_block <= entry.blockNumber < to_block
    new_votes = [entry.args.voteId for entry in entries if in_range(entry)]
    print(len(new_votes))
    actions = [get_action(vote) for vote in new_votes]
    actions = [action for action in actions if action]

    groups = db.collection('groups')
    for action in actions:
        print({k: str(v).encode("utf-8") for k, v in action.items()})
        if action['name'] == 'grant seed status':
            groups.update({'_key': action['group'], 'seed': True, 'region': action['region'], 'info': action['info']})
        else:
            groups.update({'_key': action['group'], 'seed': False})

def save_snapshot(block):
    batch = db.replication.create_dump_batch(ttl=1000)
    fname = config.SNAPSHOTS_PATH.format(block)
    zf = zipfile.ZipFile(fname+'.tmp', mode='w')
    for collection in ('users', 'groups', 'usersInGroups', 'connections', 'verifications'):
        params = {'batchId': batch['id'], 'collection': collection, 'chunkSize': config.MAX_COLLECTION_SIZE}
        r = requests.get(config.DUMP_URL, params=params)
        zf.writestr('dump/{}_{}.data.json'.format(collection, batch['id']), r.text)
    zf.close()
    os.rename(fname+'.tmp', fname)
    db.replication.delete_dump_batch(batch['id'])

def main():
    variables = db.collection('variables')
    if variables.has('LAST_BLOCK'):
        last_block = variables.get('LAST_BLOCK')['value']
    else:
        last_block = w3.eth.getBlock('latest').number
        variables.insert({
            '_key': 'LAST_BLOCK',
            'value': last_block
        })

    while True:
        # This sleep is for not calling the ethereum node endpoint
        # for getting the last block number more than once per second
        time.sleep(1)
        current_block = w3.eth.getBlock('latest').number

        if current_block>last_block:
            # Here we should go to process the block imediately, but there seems
            # to be a bug in getBlock that cause error when we get the transactions
            # instantly. This delay is added to avoid that error.
            # When error is raised, the file will run again and no bad problem occur.
            time.sleep(3)

        for block in range(last_block+1, current_block+1):
            print('processing block {}'.format(block))
            for i, tx in enumerate(w3.eth.getBlock(block, True)['transactions']):
                if tx['to'] and tx['to'].lower() in (config.TO_ADDRESS.lower(), config.DEPRECATED_TO_ADDRESS.lower()):
                    process(tx['input'])
            if block % config.SNAPSHOTS_PERIOD == 0:
                update_seed_groups(block-config.SNAPSHOTS_PERIOD, block)
                save_snapshot(block)
            last_block = block
            variables.update({'_key': 'LAST_BLOCK', 'value': last_block})


if __name__ == '__main__':
    while True:
        try:
            print('receiver started ...')
            main()
        except Exception as e:
            print(f'Error: {e}')
            time.sleep(10)
