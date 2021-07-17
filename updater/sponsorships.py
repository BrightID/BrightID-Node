import time
import json
import base64
import ed25519
import traceback
from web3 import Web3
from hashlib import sha256
from arango import ArangoClient
from web3.middleware import geth_poa_middleware, local_filter_middleware
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
variables = db['variables']
contexts = db['contexts']
sponsorships = db['sponsorships']
testblocks = db['testblocks']


def get_events(app):
    w3 = Web3(Web3.WebsocketProvider(
        app['wsProvider'], websocket_kwargs={'timeout': 60}))
    if app['wsProvider'].count('rinkeby') > 0 or app['wsProvider'].count('idchain') > 0:
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    if app.get('localFilter'):
        w3.middleware_onion.add(local_filter_middleware)

    if variables.has('LAST_BLOCK_LOG_{}'.format(app['_key'])):
        fb = variables['LAST_BLOCK_LOG_{}'.format(app['_key'])]['value']
    else:
        fb = w3.eth.getBlock('latest').number
        variables.insert({
            '_key': 'LAST_BLOCK_LOG_{}'.format(app['_key']),
            'value': fb
        })
    cb = w3.eth.getBlock('latest').number
    tb = min(cb, fb + config.CHUNK)

    print('\napp: {}'.format(app['_key']))
    print('checking events from block {} to block {}'.format(fb, tb))
    sponsor_event_contract = w3.eth.contract(
        address=w3.toChecksumAddress(app['sponsorEventContract']),
        abi=config.SPONSOR_EVENT_CONTRACT_ABI)
    time.sleep(5)
    sponsoreds = sponsor_event_contract.events.Sponsor.createFilter(
        fromBlock=fb, toBlock=tb, argument_filters=None
    ).get_all_entries()
    return sponsoreds, tb


def update():
    print('Updating sponsors', time.ctime())
    for app in db['apps']:
        if not (app.get('sponsorEventContract') and app.get('wsProvider') and app.get('sponsorPrivateKey')):
            continue
        try:
            sponsoreds, tb = get_events(app)
        except Exception as e:
            print(f'Error in getting events: {e}')
            continue
        for sponsored in sponsoreds:
            context_id = sponsored['args']['addr'].lower()
            print('checking sponsored\tapp_name: {0}, context_id: {1}'.format(
                app['_key'], context_id))

            # remove testblocks if exists
            tblocks = testblocks.find({
                'contextId': context_id,
                'action': 'sponsorship',
                'app': app['_key']
            }).batch()
            for tblock in tblocks:
                testblocks.delete(tblock)

            tsponsorships = app['totalSponsorships']
            usponsorships = sponsorships.find(
                {'_to': 'apps/{0}'.format(app['_key'])}).count()
            if (tsponsorships - usponsorships < 1):
                print("app does not have unused sponsorships")
                continue

            # check the context id is linked
            context = contexts[app['context']]
            collection = context['collection']
            c = db[collection].find({'contextId': context_id})
            if c.empty():
                db['sponsorships'].insert({
                    '_from': 'users/0',
                    '_to': 'apps/' + app['_key'],
                    'expireDate': int(time.time()) + 3600,
                    'contextId': context_id
                })
                print(f"{context_id} is not linked to a brightid yet, a temporary sponsorship is added to be applied after user links contextId")
                continue

            user = c.next()['user']
            c = sponsorships.find(
                {'_from': 'users/{0}'.format(user)})
            if not c.empty():
                print("the user is sponsored before")
                continue

            # create Sponsor operation
            op = {
                'name': 'Sponsor',
                'app': app['_key'],
                'id': user,
                'timestamp': int(time.time() * 1000),
                'v': 5
            }
            signing_key = ed25519.SigningKey(
                base64.b64decode(app['sponsorPrivateKey']))
            message = json.dumps(op, sort_keys=True,
                                 separators=(',', ':')).encode('ascii')
            sig = signing_key.sign(message)
            op['sig'] = base64.b64encode(sig).decode('ascii')
            h = base64.b64encode(sha256(message).digest()).decode("ascii")
            op['hash'] = h.replace('/', '_').replace('+', '-').replace('=', '')
            op['state'] = 'init'
            op['_key'] = op['hash']
            operation = db['operations'].get(op['hash'])
            if not operation:
                db['operations'].insert(op)

        variables.update({
            '_key': 'LAST_BLOCK_LOG_{}'.format(app['_key']),
            'value': tb
        })


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
