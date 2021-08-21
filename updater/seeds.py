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
    if len(sections) < 3:
        print(f'{text} is an invalid action')
        return

    sections[0] = sections[0].lower()
    if sections[0] not in ['grant seed status', 'revoke seed status']:
        print(f'{sections[0]} is an invalid action name')
        return

    sections[1] = sections[1].lower()
    if sections[1] not in ['star', 'community']:
        print(f'{sections[1]} is an invalid seed type')
        return

    if sections[0] == 'grant seed status':
        if sections[1] == 'star':
            if len(sections) != 5:
                print(f'"{text}" is invalid action')
                return
            keys = ['name', 'seed_type', 'id', 'quota', 'info']
        elif sections[1] == 'community':
            if len(sections) != 6:
                print(f'"{text}" is invalid action')
                return
            keys = ['name', 'seed_type', 'id', 'region', 'quota', 'info']

    elif sections[0] == 'revoke seed status':
        if len(sections) != 3:
            print(f'"{text}" is invalid action')
            return
        keys = ['name', 'seed_type', 'id']

    res = dict(zip(keys, sections))

    if 'quota' in res:
        try:
            res['quota'] = int(res['quota'])
        except:
            print(f'{res["quota"]} is invalid quota')
            return
    return res


def execute(action):
    groups_coll = db.collection('groups')
    seeds_coll = db.collection('seeds')
    users_coll = db.collection('users')

    if action['seed_type'] == 'star':
        user = users_coll.get(action['id'])
        if not user:
            print(f'The user ${action["id"]} is not found.')
            return

    elif action['seed_type'] == 'community':
        group = groups_coll.get(action['id'])
        if not group:
            print(f'The group ${action["id"]} is not found.')
            return

    if action['name'] == 'grant seed status':
        if action['seed_type'] == 'star':
            db.aql.execute('''
                UPSERT { user: @user, type: 'star' }
                INSERT { user: @user, type: 'star', quota: @quota, timestamp: @timestamp }
                UPDATE { quota: @quota } IN seeds
            ''', bind_vars={
                'user': action['id'],
                'quota': action['quota'],
                'timestamp': int(time.time() * 1000)
            })
        elif action['seed_type'] == 'community':
            if group.get('seed', False):
                seeds = db.aql.execute('''
                    FOR seed in seeds
                        FILTER seed.type == 'community'
                            AND seed.group == @group
                        RETURN seed
                ''', count=True, bind_vars={'group': action['id']})
                if len(seeds) == 0:
                    print('Seeds are not found')
                    return
                share = (action['quota'] - group['quota']) / len(seeds)
                for seed in seeds:
                    seeds_coll.update({
                        '_key': seed['_key'],
                        'quota': seed['quota'] + share if share >= 0 else int(seed['quota'] / group['quota'] * action['quota'])
                    })
            else:
                seeds = db.aql.execute('''
                    FOR ug in usersInGroups
                        FILTER ug._to == @group
                        RETURN ug
                ''', count=True, bind_vars={'group': f"groups/{action['id']}"})
                if len(seeds) == 0:
                    print('Seeds are not found')
                    return
                share = action['quota'] / len(seeds)
                for seed in seeds:
                    seeds_coll.insert({
                        'user': seed['_from'].replace('users/', ''),
                        'type': 'community',
                        'community': action['region'],
                        'group': group['_key'],
                        'quota': share,
                        'timestamp': int(time.time() * 1000)
                    })
            groups_coll.update({
                '_key': group['_key'],
                'seed': True,
                'quota': action['quota']
            })

    elif action['name'] == 'revoke seed status':
        if action['seed_type'] == 'star':
            db.aql.execute('''
                FOR s in seeds
                    FILTER s.user == @user
                        && s.type == 'star'
                    REMOVE s IN seeds
            ''', bind_vars={'user': action['id']})

        elif action['seed_type'] == 'community':
            db.aql.execute('''
                FOR s in seeds
                    FILTER s.group == @group
                        && s.type == 'community'
                    REMOVE s IN seeds
            ''', bind_vars={'group': action['id']})
            groups_coll.update({
                '_key': action['id'],
                'seed': False,
                'quota': 0
            })


def update():
    print('Updating Seed Groups', time.ctime())
    votes_length = voting.functions.votesLength().call()
    variables = db.collection('variables')
    if variables.has('SEED_UPDATER'):
        checked = variables.get('SEED_UPDATER')['votes']
    else:
        checked = list(range(1, votes_length))
        variables.insert({
            '_key': 'SEED_UPDATER',
            'votes': checked
        })
    keys = ['open', 'executed', 'startDate', 'snapshotBlock', 'supportRequired',
            'minAcceptQuorum', 'yea', 'nay', 'votingPower', 'script']
    vote_ids = [v for v in range(1, votes_length) if v not in checked]
    for vote_id in vote_ids:
        vote = voting.functions.getVote(vote_id).call()
        vote = dict(zip(keys, vote))
        supported = vote['yea'] / (vote['yea'] + vote['nay']
                                   ) >= vote['supportRequired'] / 10**18
        approved = (vote['yea'] / vote['votingPower']
                    ) >= vote['minAcceptQuorum'] / 10**18
        if vote['executed'] or (not vote['open'] and supported and approved):
            # approved
            action = get_action(vote_id)
            if action:
                execute(action)
            checked.append(vote_id)
            variables.update({
                '_key': 'SEED_UPDATER',
                'votes': checked
            })
        elif not vote['open'] and not supported or not approved:
            # rejected
            checked.append(vote_id)
            variables.update({
                '_key': 'SEED_UPDATER',
                'votes': checked
            })


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
