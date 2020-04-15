from web3 import Web3
from web3.middleware import geth_poa_middleware
from arango import ArangoClient
import config

db = ArangoClient().db('_system')
w3 = Web3(Web3.WebsocketProvider(
    config.INFURA_URL, websocket_kwargs={'timeout': 60}))
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
    lb2 = min(w3.eth.getBlock('latest').number, lb + 1000)
    print('\nchecking events from block {} to block {}'.format(lb, lb2))
    sponsoreds = brightid_contract.events.SponsorshipRequested.createFilter(
        fromBlock=lb, toBlock=lb2, argument_filters=None
    ).get_all_entries()
    for sponsored in sponsoreds:
        eth_context_name = bytes32_to_string(sponsored['args']['context'])
        c = db.collection('contexts').find({'ethName': eth_context_name})
        if c.empty():
            print("context doesn't exist")
            continue
        context = c.batch()[0]
        if context.get('idsAsHex'):
            context_id = '0x' + sponsored['args']['contextid'].hex()[24:]
        else:
            context_id = bytes32_to_string(sponsored['args']['contextid'])

        print('checking sponsored\tcontext_name: {0}, context_id: {1}'.format(
            eth_context_name, context_id))

        c = db.collection(context['collection']).find(
            {'contextId': context_id})
        if c.empty():
            print("the context id doesn't link to any user under this context")
            continue
        user = c.batch()[0]['user']

        c = db.collection('sponsorships').find(
            {'_from': 'users/{0}'.format(user)})
        if not c.empty():
            print("the user is sponsored before")
            continue

        tsponsorships = db.collection('contexts').get(
            context['_key']).get('totalSponsorships')
        usponsorships = db.collection('sponsorships').find(
            {'_to': 'contexts/{0}'.format(context['_key'])}).count()
        if (tsponsorships - usponsorships < 1):
            print("the context doesn't have enough sponsorships")
            continue

        # sponsor
        db.collection('sponsorships').insert({
            '_from': 'users/{}'.format(user),
            '_to': 'contexts/{}'.format(context['_key'])
        })
    variables.update({
        '_key': 'LAST_BLOCK_LOG',
        'value': lb2
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
