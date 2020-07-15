from web3 import Web3
from web3.middleware import geth_poa_middleware
from arango import ArangoClient
import config

db = ArangoClient().db('_system')


def str2bytes32(s):
    assert len(s) <= 32
    padding = (2 * (32 - len(s))) * '0'
    return (bytes(s, 'utf-8')).hex() + padding


def update_apps_balance():
    w3 = Web3(Web3.WebsocketProvider(
        config.INFURA_URL, websocket_kwargs={'timeout': 60}))
    if config.INFURA_URL.count('rinkeby') > 0 or config.INFURA_URL.count('idchain') > 0:
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    sp_contract = w3.eth.contract(
        address=config.SP_ADDRESS,
        abi=config.SP_ABI)

    for app in db['apps']:
        app_bytes = str2bytes32(app['_key'])
        app['totalSponsorships'] = sp_contract.functions.totalContextBalance(
            app_bytes).call()
        print(app['_key'], app['totalSponsorships'])
        db['apps'].update(app)


def check_sponsor_requests():
    variables = db['variables']
    contexts = db['contexts']
    sponsorships = db['sponsorships']
    for app in db['apps']:
        if 'sponsorEventContract' not in app or 'wsProvider' not in app:
            continue
        w3 = Web3(Web3.WebsocketProvider(
            app['wsProvider'], websocket_kwargs={'timeout': 60}))
        if app['wsProvider'].count('rinkeby') > 0 or app['wsProvider'].count('idchain') > 0:
            w3.middleware_onion.inject(geth_poa_middleware, layer=0)

        if variables.has('LAST_BLOCK_LOG_{}'.format(app['_key'])):
            fb = variables['LAST_BLOCK_LOG_{}'.format(app['_key'])]['value']
        else:
            fb = w3.eth.getBlock('latest').number
            variables.insert({
                '_key': 'LAST_BLOCK_LOG_{}'.format(app['_key']),
                'value': fb
            })
        cb = w3.eth.getBlock('latest').number
        fb = fb - config.RECHECK_CHUNK if fb > config.RECHECK_CHUNK else cb - config.RECHECK_CHUNK
        tb = min(cb, fb + config.CHUNK)

        print('\napp: {}'.format(app['_key']))
        print('checking events from block {} to block {}'.format(fb, tb))
        sponsor_event_contract = w3.eth.contract(
            address=app['sponsorEventContract'],
            abi=config.SPONSOR_EVENT_CONTRACT_ABI)

        sponsoreds = sponsor_event_contract.events.Sponsor.createFilter(
            fromBlock=fb, toBlock=tb, argument_filters=None
        ).get_all_entries()
        for sponsored in sponsoreds:
            context_id = sponsored['args']['addr'].lower()

            print('checking sponsored\tapp_name: {0}, context_id: {1}'.format(
                app['_key'], context_id))
            context = contexts[app['context']]
            collection = context['collection']
            c = db[collection].find(
                {'contextId': context_id})
            if c.empty():
                print("the context id doesn't link to any user under this context")
                continue
            user = c.next()['user']

            c = sponsorships.find(
                {'_from': 'users/{0}'.format(user)})
            if not c.empty():
                print("the user is sponsored before")
                continue

            tsponsorships = app['totalSponsorships']
            usponsorships = sponsorships.find(
                {'_to': 'apps/{0}'.format(app['_key'])}).count()
            if (tsponsorships - usponsorships < 1):
                print("the app doesn't have enough sponsorships")
                continue

            # sponsor
            sponsorships.insert({
                '_from': 'users/{}'.format(user),
                '_to': 'apps/{}'.format(app['_key'])
            })
            print('Sponsored')
        variables.update({
            '_key': 'LAST_BLOCK_LOG_{}'.format(app['_key']),
            'value': tb
        })


def main():
    update_apps_balance()
    check_sponsor_requests()


if __name__ == '__main__':
    main()
