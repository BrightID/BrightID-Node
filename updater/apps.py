import time
import base64
import requests
import traceback
from web3 import Web3
from arango import ArangoClient
from web3.middleware import geth_poa_middleware
import config


db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
local_to_json = {
    '_key': 'Key',
    'name': 'Name',
    'context': 'Context',
    'url': 'Links',
    'logo': 'logo',
    'sponsorPublicKey': 'Sponsor Public Key',
    'sponsorEventContract': 'Contract Address',
    'wsProvider': 'Websocket Endpoint',
    'verification': 'Verification',
}


def str2bytes32(s):
    assert len(s) <= 32
    padding = (2 * (32 - len(s))) * '0'
    return (bytes(s, 'utf-8')).hex() + padding


def apps_data():
    print('Updating applications', time.ctime())
    local_apps = {app['_key']: app for app in db['apps']}

    json_apps = requests.get(config.APPS_JSON_FILE).json()['Applications']
    for json_app in json_apps:
        try:
            res = requests.get(json_app['Images'][0])
            file_format = json_app['Images'][0].split('.')[-1]
            if file_format == 'svg':
                file_format == 'svg+xml'
            json_app['logo'] = 'data:image/' + file_format + ';base64,' + \
                base64.b64encode(res.content).decode('ascii')
        except Exception as e:
            print('Error in getting logo', e)
            json_app['logo'] = ''

        new_local_app = {key: json_app[local_to_json[key]] for key in local_to_json}
        new_local_app['url'] = new_local_app['url'][0]

        local_app = local_apps.get(json_app['Key'])
        if not local_app:
            print(f"Insert new app: {new_local_app['_key']}")
            try:
                db['apps'].insert(new_local_app)
            except Exception as e:
                print(f'Error in inserting new application: {e}')
            continue

        for key in new_local_app:
            if new_local_app.get(key) != local_app.get(key):
                print(f"Updating {new_local_app['_key']} application")
                try:
                    db['apps'].update(new_local_app)
                except Exception as e:
                    print(f'Error in updating application: {e}')
                break


def apps_balance():
    print("Updating sponsorships balance of applications", time.ctime())
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


def update():
    apps_data()
    apps_balance()


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
