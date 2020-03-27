from web3 import Web3
from web3.middleware import geth_poa_middleware
from arango import ArangoClient
import config

db = ArangoClient().db('_system')
w3 = Web3(Web3.WebsocketProvider(config.INFURA_URL))
if config.INFURA_URL.count('rinkeby') > 0:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)

sp_contract = w3.eth.contract(
    address=config.SP_ADDRESS,
    abi=config.SP_ABI)

brightid_contract = w3.eth.contract(
    address=config.BRIGHTID_ADDRESS,
    abi=config.BRIGHTID_ABI)


def str2bytes32(s):
    assert len(s) <= 32
    padding = (2 * (32 - len(s))) * '0'
    return (bytes(s, 'utf-8')).hex() + padding


def bytes32_to_string(b):
    b = b.hex().rstrip('0')
    if len(b) % 2 != 0:
        b = b + '0'
    return bytes.fromhex(b).decode('utf8')


def context_balance(context_name):
    b_context_name = str2bytes32(context_name)
    balance = sp_contract.functions.totalContextBalance(b_context_name).call()
    return balance


def check_sponsor_requests():
    variables = db.collection('variables')
    if variables.has('LAST_BLOCK_LOG'):
        lb = variables.get('LAST_BLOCK_LOG')['value']
    else:
        variables.insert({
            '_key': 'LAST_BLOCK_LOG',
            'value': 1
        })
        lb = 1
    sponsoreds = brightid_contract.events.SponsorRequested.createFilter(
        fromBlock=lb, argument_filters=None
    ).get_all_entries()

    lb2 = w3.eth.getBlock('latest').number
    for sponsored in sponsoreds:
        eth_context_name = bytes32_to_string(sponsored['args']['context'])
        context_id = bytes32_to_string(sponsored['args']['contextid'])
        print('checking sponsored\tcontext_name: {0}, context_id: {1}'.format(
            eth_context_name, context_id))
        c = db.collection('contexts').find({'ethName': eth_context_name})
        if c.empty():
            # context doesn't exist
            continue
        context = c.batch()[0]

        c = db.collection(context['collection']).find(
            {'contextId': context_id})
        if c.empty():
            # the context id doesn't link to any user under this context
            continue
        user = c.batch()[0]['user']

        c = db.collection('sponsorships').find(
            {'_from': 'users/{0}'.format(user)})
        if not c.empty():
            # the user is sponsored before
            continue

        verifications = db.collection('users').get(user).get('verifications')
        if not verifications or context['verification'] not in verifications:
            # the user can not be verified for this context
            continue

        tsponsorships = db.collection('contexts').get(
            context['_key']).get('totalSponsorships')
        usponsorships = db.collection('sponsorships').find(
            {'_to': 'contexts/{0}'.format(context['_key'])}).count()
        if (tsponsorships - usponsorships < 1):
            # the context doesn't have enough sponsorships
            continue

        # sponsor
        db.collection('sponsorships').insert({
            '_from': 'users/{}'.format(user),
            '_to': 'contexts/{}'.format(context['_key'])
        })
    variables.update({
        '_key': 'LAST_BLOCK_LOG',
        'value': lb2 - 5800  # to check the past 24 hours requests again
    })


def main():
    contexts = db.collection('contexts').all().batch()
    for context in contexts:
        context['totalSponsorships'] = context_balance(context['_key'])
        print(context['_key'], context['totalSponsorships'])
        db.collection('contexts').update(context)
    check_sponsor_requests()


if __name__ == '__main__':
    main()
