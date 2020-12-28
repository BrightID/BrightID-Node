import time
import traceback
from web3 import Web3
from arango import ArangoClient
from web3.middleware import geth_poa_middleware
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
w3 = Web3(Web3.WebsocketProvider(config.SEED_GROUPS_WS_URL))
if config.SEED_GROUPS_WS_URL.count('rinkeby') > 0 or config.SEED_GROUPS_WS_URL.count('idchain') > 0:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
voting = w3.eth.contract(address=config.VOTING_ADDRESS, abi=config.VOTING_ABI)


def get_action(vote_id):
    text = voting.events.StartVote.createFilter(
        fromBlock="0x0",
        argument_filters={'voteId': vote_id}
    ).get_all_entries()[0].args.metadata
    sections = [s.strip() for s in text.split('|')]

    name = sections[0].lower() if len(sections) > 0 else None
    if name not in ['grant seed status', 'revoke seed status']:
        print('{} is an invalid action'.format(name))
        return None
    if ((name == 'grant seed status' and len(sections) != 5) or
            (name == 'revoke seed status' and len(sections) != 3)):
        print('"{}" is invalid action'.format(text))
        return None

    group = sections[1]
    if not db.collection('groups').get(group):
        print('group not found: {}'.format(group))
        return None

    region = sections[2] if name == 'grant seed status' else None
    quota = sections[3] if name == 'grant seed status' else None
    info = sections[4] if name == 'grant seed status' else None
    return {'name': name, 'group': group, 'region': region, 'info': info, 'quota': quota}


def update():
    print('Updating Seed Groups', time.ctime())
    variables = db.collection('variables')
    if variables.has('LAST_BLOCK_SEED_UPDATER'):
        last_block = variables.get('LAST_BLOCK_SEED_UPDATER')['value']
    else:
        last_block = w3.eth.getBlock('latest').number
        variables.insert({
            '_key': 'LAST_BLOCK_SEED_UPDATER',
            'value': last_block
        })
    current_block = w3.eth.getBlock('latest').number
    if current_block < last_block:
        last_block = current_block - 10000
    print(last_block, current_block)
    entries = voting.events.ExecuteVote.createFilter(
        fromBlock=last_block).get_all_entries()

    def in_range(entry): return last_block <= entry.blockNumber < current_block
    new_votes = [entry.args.voteId for entry in entries if in_range(entry)]
    print(len(new_votes))
    actions = [get_action(vote) for vote in new_votes]
    actions = [action for action in actions if action]

    groups = db.collection('groups')
    for action in actions:
        print({k: str(v).encode("utf-8") for k, v in action.items()})
        if action['name'] == 'grant seed status':
            groups.update({'_key': action['group'], 'seed': True, 'region': action['region'],
                           'info': action['info'], 'quota': int(action['quota'])})
        else:
            groups.update({'_key': action['group'], 'seed': False})
    variables.update({'_key': 'LAST_BLOCK_SEED_UPDATER', 'value': current_block})


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
