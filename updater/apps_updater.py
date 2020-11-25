import time
import base64
import requests
import traceback
from arango import ArangoClient
import config

db = ArangoClient().db('_system')
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


def update():
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


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
