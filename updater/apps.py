import time
import base64
import requests
import traceback
from web3 import Web3
from arango import ArangoClient
from web3.middleware import geth_poa_middleware
import config
from marshmallow import Schema, fields

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
w3_mainnet = Web3(Web3.WebsocketProvider(
    config.MAINNET_WSS, websocket_kwargs={'timeout': 60}))
sp_contract_mainnet = w3_mainnet.eth.contract(
    address=config.MAINNET_SP_ADDRESS,
    abi=config.SP_ABI)

w3_idchain = Web3(Web3.WebsocketProvider(
    config.IDCHAIN_WSS, websocket_kwargs={'timeout': 60}))
w3_idchain.middleware_onion.inject(geth_poa_middleware, layer=0)
sp_contract_idchain = w3_idchain.eth.contract(
    address=config.IDCHAIN_SP_ADDRESS,
    abi=config.SP_ABI)

key_converter_dic = {
    '_key': 'Key',
    'name': 'Name',
    'context': 'Context',
    'sponsorPublicKey': 'Sponsor Public Key',
    'sponsorEventContract': 'Contract Address',
    'verification': 'Verification',
    'verifications': 'Verifications',
    'testing': 'Testing',
    'idsAsHex': 'Ids As Hex',
    'usingBlindSig': 'Using Blind Sig',
    'localFilter': 'Local Filter',
    'nodeUrl': 'Node Url',
    'verificationExpirationLength': 'Verification Expiration Length',
    'soulbound': 'Soulbound',
    'callbackUrl': 'Callback Url',
    'poaNetwork': 'POA Network',
    'rpcEndpoint': 'RPC Endpoint',
    'callbackUrl': 'Callback Url'
}


class AppSchema(Schema):
    _key = fields.String(required=True, allow_none=True)
    name = fields.String(required=True, allow_none=True)
    context = fields.String(required=True, allow_none=True)
    sponsorPublicKey = fields.String(required=True, allow_none=True)
    sponsorEventContract = fields.String(required=True, allow_none=True)
    verification = fields.String(required=True, allow_none=True)
    verifications = fields.List(
        fields.String(), metadata={'allow_blank': True})
    testing = fields.Boolean(required=True)
    idsAsHex = fields.Boolean(required=True)
    usingBlindSig = fields.Boolean(required=True)
    localFilter = fields.Boolean(required=True)
    nodeUrl = fields.URL(required=True, allow_none=True)
    verificationExpirationLength = fields.Integer(
        required=True, allow_none=True)
    soulbound = fields.Boolean(required=True)
    poaNetwork = fields.Boolean(required=True)
    rpcEndpoint = fields.URL(required=True, allow_none=True, schemes={
                             'http', 'https', 'ws', 'wss'})
    callbackUrl = fields.URL(required=True, allow_none=True)
    url = fields.URL(required=True, allow_none=True)
    logo = fields.String(required=True, allow_none=True)


app_schema = AppSchema()


def str2bytes32(s):
    assert len(s) <= 32
    padding = (2 * (32 - len(s))) * '0'
    return (bytes(s, 'utf-8')).hex() + padding


def get_logo(url):
    try:
        res = requests.get(url)
        file_format = url.split('.')[-1]
        if file_format == 'svg':
            file_format == 'svg+xml'
        logo = 'data:image/' + file_format + ';base64,' + \
            base64.b64encode(res.content).decode('ascii')
    except Exception as e:
        print(f'Error in getting logo: {e}')
        logo = ''
    return logo


def row_to_app(row):
    app = {k1: row[k2] if row[k2] != '' else None for k1,
           k2 in key_converter_dic.items() if k2 in row}
    app['url'] = next(iter(row.get('Links', [])), '').strip()
    app['logo'] = get_logo(next(iter(row.get('Images', [])), '').strip())
    app = app_schema.load(app)
    return app


def update():
    print('Updating apps', time.ctime())
    data = requests.get(config.APPS_JSON_FILE).json()
    for row in data['Applications']:
        try:
            app = row_to_app(row)
        except Exception as e:
            print(f'app: {row["Key"]} => Invalid data: {e}')
            app = {'_key': row["Key"]}

        try:
            app['totalSponsorships'] = get_sponsorships(app['_key'])
            # print(f'app: {app["_key"]} => totalSponsorships: {app["totalSponsorships"]}')
        except Exception as e:
            print(f'app: {row["Key"]} => Error in get totalSponsorships: {e}')

        if not app:
            continue

        db.aql.execute('''
            INSERT @app IN apps
            OPTIONS { overwriteMode: "update" }
        ''', bind_vars={
            "app": app
        })

    for app_key in data['Removed apps']:
        db.aql.execute('''
            for app in apps
                filter app._key == @key
                REMOVE { _key: app._key } IN apps OPTIONS { ignoreErrors: true }
        ''', bind_vars={
            'key': app_key,
        })


def get_sponsorships(app_key):
    app_bytes = str2bytes32(app_key)
    mainnet_balance = sp_contract_mainnet.functions.totalContextBalance(
        app_bytes).call()
    idchain_balance = sp_contract_idchain.functions.totalContextBalance(
        app_bytes).call()
    totalSponsorships = mainnet_balance + idchain_balance
    return totalSponsorships


if __name__ == '__main__':
    try:
        ts = time.time()
        update()
        print(f'Updating apps ended in {int(time.time() - ts)} seconds')
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
