import time
import traceback
from web3 import Web3
from arango import ArangoClient
from web3.middleware import geth_poa_middleware, local_filter_middleware
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
variables = db['variables']
contexts = db['contexts']
sponsorships = db['sponsorships']
testblocks = db['testblocks']


def get_w3(app):
    if app['rpcEndpoint'].startswith("http"):
        w3 = Web3(Web3.HTTPProvider(
            app['rpcEndpoint'], request_kwargs={'timeout': 60}))
    elif app['rpcEndpoint'].startswith("ws"):
        w3 = Web3(Web3.WebsocketProvider(
            app['rpcEndpoint'], websocket_kwargs={'timeout': 60}))
    else:
        raise ValueError(f'invalid RPC: {app["rpcEndpoint"]}')

    if app.get('poaNetwork'):
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)

    if app.get('localFilter'):
        w3.middleware_onion.add(local_filter_middleware)
    return w3


def get_events(app):
    print(f'\napp: {app["_key"]}')
    w3 = get_w3(app)
    if variables.has(f'LAST_BLOCK_LOG_{app["_key"]}'):
        fb = variables[f'LAST_BLOCK_LOG_{app["_key"]}']['value']
    else:
        fb = w3.eth.getBlock('latest').number

        variables.insert({
            '_key': f'LAST_BLOCK_LOG_{app["_key"]}',
            'value': fb
        })

    cb = w3.eth.getBlock('latest').number
    tb = min(cb, fb + config.CHUNK)

    if tb < fb:
        fb = tb - config.CHUNK
    fb = fb - config.RECHECK_CHUNK

    print(f'checking events from block {fb} to block {tb}')
    sponsor_event_contract = w3.eth.contract(
        address=w3.toChecksumAddress(app['sponsorEventContract']),
        abi=config.SPONSOR_EVENT_CONTRACT_ABI)
    time.sleep(5)
    sponsoreds = sponsor_event_contract.events.Sponsor.createFilter(
        fromBlock=fb, toBlock=tb, argument_filters=None
    ).get_all_entries()
    return sponsoreds, tb


def sponsor(app, app_id):
    c = sponsorships.find({
        '_to': 'apps/' + app['_key'],
        'appId': app_id
    })
    if c.empty():
        db['sponsorships'].insert({
            '_from': 'users/0',
            '_to': 'apps/' + app['_key'],
            'expireDate': int(time.time()) + 3600,
            'appId': app_id,
            'appHasAuthorized': True,
            'spendRequested': False
        })
        print('applied')
        return

    sponsorship = c.next()
    if sponsorship['appHasAuthorized']:
        print('app has authorized before')
        return

    if sponsorship['spendRequested']:
        db['sponsorships'].update({
            '_key': sponsorship['_key'],
            'expireDate': None,
            'appHasAuthorized': True,
            'timestamp': int(time.time() * 1000),
        })
        print('applied')


def has_sponsorship(app):
    tsponsorships = app['totalSponsorships']
    usponsorships = sponsorships.find(
        {'_to': 'apps/{0}'.format(app['_key']), 'expireDate': None}).count()
    return tsponsorships - usponsorships > 0


def remove_testblocks(app, context_id):
    # remove testblocks if exists
    tblocks = testblocks.find({
        'contextId': context_id,
        'action': 'sponsorship',
        'app': app['_key']
    }).batch()
    for tblock in tblocks:
        testblocks.delete(tblock)


def is_using_sponsor_contract(app):
    if not app.get('sponsorEventContract'):
        return False
    if not app.get('rpcEndpoint'):
        return False
    return True


def update():
    print('Updating sponsors', time.ctime())
    for app in db['apps']:
        if not is_using_sponsor_contract(app):
            continue
        try:
            sponsoreds, tb = get_events(app)
        except Exception as e:
            print(f'Error in getting events: {e}')
            continue
        for sponsored in sponsoreds:
            _id = sponsored['args']['addr'].lower()
            print(f'checking\tapp_name: {app["_key"]}\tapp_id: {_id}')

            if not app.get('usingBlindSig', False):
                remove_testblocks(app, _id)

            if not has_sponsorship(app):
                print("app does not have unused sponsorships")
                continue

            sponsor(app, _id)

        variables.update({
            '_key': f'LAST_BLOCK_LOG_{app["_key"]}',
            'value': tb
        })


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
