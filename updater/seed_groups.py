import time
import traceback
from web3 import Web3
from arango import ArangoClient
from web3.middleware import geth_poa_middleware
import tools
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
    if len(sections) < 3:
        print(f'"{text}" is an invalid action')
        return

    sections[0] = sections[0].lower()
    if sections[0] not in ['grant seed status', 'revoke seed status']:
        print(f'"{sections[0]}" is an invalid action name')
        return

    if ((sections[0] == 'grant seed status' and len(sections) != 5) or
            (sections[0] == 'revoke seed status' and len(sections) != 3)):
        print(f'"{text}" is invalid action')
        return

    keys = ['name', 'group', 'region', 'quota', 'info']
    res = dict(zip(keys, sections))
    return res


def execute(action):
    print("applying: ", {k: str(v).encode("utf-8") for k, v in action.items()})
    groups_coll = db.collection('groups')
    group = groups_coll.get(action['group'])
    if not group:
        print(f'The group ${action["group"]} is not found.')
        return

    if 'quota' in action:
        try:
            action['quota'] = int(action['quota'])
        except Exception:
            print(f'{action["quota"]} is invalid quota')
            return

    if action['name'] == 'grant seed status':
        groups_coll.update({'_key': action['group'], 'seed': True,
                            'region': action['region'], 'info': action['info'], 'quota': action['quota']})
    else:
        groups_coll.update({'_key': action['group'], 'seed': False})


def update():
    print('Updating Seed Groups', time.ctime())
    votes_length = voting.functions.votesLength().call()
    variables = db.collection('variables')
    if variables.has('SEED_GROUP_UPDATER_CHECKED_VOTES'):
        checked = variables.get('SEED_GROUP_UPDATER_CHECKED_VOTES')['votes']
    else:
        checked = list(range(0, votes_length))
        variables.insert({
            '_key': 'SEED_GROUP_UPDATER_CHECKED_VOTES',
            'votes': checked
        })
    keys = ['open', 'executed', 'startDate', 'snapshotBlock', 'supportRequired',
            'minAcceptQuorum', 'yea', 'nay', 'votingPower', 'script']
    vote_ids = [v for v in range(0, votes_length) if v not in checked]
    for vote_id in vote_ids:
        print(f'processing vote: {vote_id}')
        vote = voting.functions.getVote(vote_id).call()
        vote = dict(zip(keys, vote))
        supported = vote['yea'] / (vote['yea'] + vote['nay']
                                   ) >= vote['supportRequired'] / 10**18
        approved = (vote['yea'] / vote['votingPower']
                    ) >= vote['minAcceptQuorum'] / 10**18
        if not vote['open']:
            if supported and approved:
                action = get_action(vote_id)
                print(f"action: {action}")
                if action:
                    execute(action)
            checked.append(vote_id)
    variables.update({
        '_key': 'SEED_GROUP_UPDATER_CHECKED_VOTES',
        'votes': checked
    })


if __name__ == '__main__':
    try:
        update()

        bn = tools.get_idchain_block_number()
        db.aql.execute('''
            upsert { _key: "SEED_GROUPS_LAST_UPDATE" }
            insert { _key: "SEED_GROUPS_LAST_UPDATE", value: @bn }
            update { value: @bn }
            in variables
        ''', bind_vars={
            'bn': bn
        })

    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
