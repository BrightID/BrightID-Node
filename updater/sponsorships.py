import time
import traceback
from web3 import Web3
from arango import ArangoClient
from concurrent.futures import ThreadPoolExecutor
from web3.middleware import geth_poa_middleware, local_filter_middleware
import tools
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')


def get_w3(app):
    if app['rpcEndpoint'].startswith('http'):
        w3 = Web3(Web3.HTTPProvider(
            app['rpcEndpoint'], request_kwargs={'timeout': 60}))
    elif app['rpcEndpoint'].startswith('ws'):
        w3 = Web3(Web3.WebsocketProvider(
            app['rpcEndpoint'], websocket_kwargs={'timeout': 60}))
    else:
        raise ValueError(f'invalid RPC: {app["rpcEndpoint"]}')

    if app.get('poaNetwork'):
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)

    if app.get('localFilter'):
        w3.middleware_onion.add(local_filter_middleware)
    return w3


def check_events(app):
    w3 = get_w3(app)
    cb = w3.eth.getBlock('latest').number

    c = db.aql.execute('''
        for v in variables
            filter v._key == @key
            return v.value
    ''', bind_vars={
        'key': f'LAST_BLOCK_LOG_{app["_key"]}'
    })

    if c.empty():
        fb = cb
        db['variables'].insert({
            '_key': f'LAST_BLOCK_LOG_{app["_key"]}',
            'value': cb
        })
    else:
        fb = c.next()
    fb -= config.RECHECK_CHUNK
    tb = min(cb, fb + config.CHUNK)
    if tb < fb:
        fb = tb - config.CHUNK

    print(f'app: {app["_key"]} => checking events from: {fb} to: {tb}')
    sponsor_event_contract = w3.eth.contract(
        address=w3.toChecksumAddress(app['sponsorEventContract']),
        abi=config.SPONSOR_EVENT_CONTRACT_ABI)
    time.sleep(3)
    events = sponsor_event_contract.events.Sponsor.createFilter(
        fromBlock=fb, toBlock=tb, argument_filters=None
    ).get_all_entries()
    sponsored_addrs = [e['args']['addr'].lower() for e in events]
    return sponsored_addrs, tb


def sponsor(app_key, app_id):
    c = db['sponsorships'].find({
        '_to': 'apps/' + app_key,
        'appId': app_id
    })

    if c.empty():
        db['sponsorships'].insert({
            '_from': 'users/0',
            '_to': 'apps/' + app_key,
            'expireDate': int(time.time()) + 3600,
            'appId': app_id,
            'appHasAuthorized': True,
            'spendRequested': False
        })
        print(
            f'app: {app_key} appId: {app_id} => app authorization applied successfully')
        return False

    sponsorship = c.next()
    if sponsorship['appHasAuthorized']:
        print(f'app: {app_key} appId: {app_id} => app has authorized before')
        return False

    if sponsorship['spendRequested']:
        db['sponsorships'].update({
            '_key': sponsorship['_key'],
            'expireDate': None,
            'appHasAuthorized': True,
            'timestamp': int(time.time() * 1000),
        })
        print(f'app: {app_key} appId: {app_id} => sponsored successfully')
        return True


def remove_testblocks(app_key, context_id):
    # remove testblocks if exists
    db.aql.execute('''
        for t in testblocks
            filter t.contextId == @context_id
            and t.app == @app_key
            and t.action == "sponsorship"
            remove { _key: t._key } in testblocks options { ignoreErrors: true }
    ''', bind_vars={
        'context_id': context_id,
        'app_key': app_key,
    })


def update_app(app):
    try:
        sponsored_addrs, tb = check_events(app)
        db['variables'].update({
            '_key': f'LAST_BLOCK_LOG_{app["_key"]}',
            'value': tb
        })
    except Exception as e:
        print(f'app: {app["_key"]} => Error in getting events: {e}')
        return

    used = 0
    for sponsored_addr in sponsored_addrs:
        if not app.get('usingBlindSig'):
            remove_testblocks(app['_key'], sponsored_addr)

        if app['totalSponsorships'] - (app['usedSponsorships'] + used) < 1:
            print(
                f'app: {app["_key"]} appId: {sponsored_addr} => app does not have unused sponsorships')
            continue

        sponsored = sponsor(app['_key'], sponsored_addr)
        if sponsored:
            used += 1

    if used > 0:
        db.aql.execute('''
            for app in apps
              filter app._key == @key
              update app with { usedSponsorships: app.usedSponsorships + @used } in apps
        ''', bind_vars={
            'key': app['_key'],
            'used': used
        })


def update():
    apps = db.aql.execute('''
        for app in apps
        filter app.sponsorEventContract not in [null, ""]
        and app.rpcEndpoint not in [null, ""]
        return {
            _key: app._key,
            totalSponsorships: app.totalSponsorships || 0,
            usingBlindSig: app.usingBlindSig,
            rpcEndpoint: app.rpcEndpoint,
            poaNetwork: app.poaNetwork,
            localFilter: app.localFilter,
            sponsorEventContract: app.sponsorEventContract,
            usedSponsorships: app.usedSponsorships || 0
        }
    ''').batch()

    with ThreadPoolExecutor(max_workers=5) as executor:
        executor.map(update_app, apps)


if __name__ == '__main__':
    try:
        print(f'\nUpdating sponsors {time.ctime()}')
        ts = time.time()
        update()

        bn = tools.get_idchain_block_number()
        db.aql.execute('''
            upsert { _key: "SPONSORSHIPS_LAST_UPDATE" }
            insert { _key: "SPONSORSHIPS_LAST_UPDATE", value: @bn }
            update { value: @bn }
            in variables
        ''', bind_vars={
            'bn': bn
        })

        print(f'Updating sponsors ended in {int(time.time() - ts)} seconds\n')
    except Exception as e:
        print(f'Error in sponsorships updater: {e}\n')
        traceback.print_exc()
