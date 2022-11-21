import requests
import json
import config


def get_idchain_block_number():
    payload = json.dumps(
        {'jsonrpc': '2.0', 'method': 'eth_blockNumber', 'params': [], 'id': 1})
    headers = {'content-type': 'application/json', 'cache-control': 'no-cache'}
    r = requests.request('POST', config.IDCHAIN_RPC_URL,
                         data=payload, headers=headers)
    return int(r.json()['result'], 0)
