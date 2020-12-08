import time
import base64
import requests
import traceback
from arango import ArangoClient
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')

local_to_json = {
    'name': 'Name',
    'context': 'Context',
    'url': 'url',
    'sponsorPublicKey': 'Sponsor Public Key',
    'sponsorEventContract': 'Contract Address',
    'wsProvider': 'Websocket Endpoint',
    'verification': 'Verification',
    'logo': 'logo'
}


def update():
    print('Updating applications', time.ctime())
    local_apps = {app['_key']: app for app in db['apps']}

    json_apps = requests.get(config.APPS_JSON_FILE).json()['Applications']
    for json_app in json_apps:
        key = json_app['Key']
        json_app['url'] = json_app['Links'][0]
        local_app = local_apps.get(key, {})

        try:
            res = requests.get(json_app['Images'][0])
            file_format = json_app['Images'][0].split('.')[-1]
            json_app['logo'] = 'data:image/' + file_format + ';base64,' + \
                base64.b64encode(res.content).decode('ascii')
        except Exception as e:
            print('Error in getting logo', e)
            json_app['logo'] = ''

        if key not in local_apps:
            print(f'Insert new app: {key}')
            try:
                db['apps'].insert({
                    '_key': key,
                    'name': json_app['Name'],
                    'context': json_app['Context'],
                    'url': json_app['url'],
                    'logo': json_app['logo'],
                    'sponsorPublicKey': json_app['Sponsor Public Key'],
                    'sponsorEventContract': json_app['Contract Address'],
                    'wsProvider': json_app['Websocket Endpoint'],
                    'verification': json_app['Verification']
                })
            except Exception as e:
                print(f'Error in inserting new application: {e}')
            continue

        for local_key, json_key in local_to_json.items():
            if json_app.get(json_key) != local_app.get(local_key):
                print(f'Updating {key} application')
                try:
                    db['apps'].update({
                        '_key': key,
                        'name': json_app['Name'],
                        'context': json_app['Context'],
                        'url': json_app['url'],
                        'sponsorPublicKey': json_app['Sponsor Public Key'],
                        'sponsorEventContract': json_app['Contract Address'],
                        'wsProvider': json_app['Websocket Endpoint'],
                        'verification': json_app['Verification'],
                        'logo': json_app['logo']
                    })
                except Exception as e:
                    print(f'Error in updating application: {e}')
                break


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
