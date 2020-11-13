import time
import base64
import requests
import traceback
from arango import ArangoClient
import config

db = ArangoClient().db('_system')


def update():
    print('Updating applications', time.ctime())
    local_apps = {app['_key']: app for app in db['apps']}

    json_apps = requests.get(config.APPS_JSON_FILE).json()['Applications']
    for json_app in json_apps:
        try:
            res = requests.get(json_app['Images'][0])
            file_format = json_app['Images'][0].split('.')[-1]
            logo = 'data:image/' + file_format + ';base64,' + \
                base64.b64encode(res.content).decode('ascii')
        except Exception as e:
            print('Error in getting logo', e)
            logo = ''

        new_local_app = {
            '_key': json_app['Key'],
            'name': json_app['Name'],
            'context': json_app['Context'],
            'url': json_app['Links'][0],
            'logo': logo,
            'sponsorPublicKey': json_app['Sponsor Public Key'],
            'sponsorEventContract': json_app['Contract Address'],
            'wsProvider': json_app['Websocket Endpoint'],
            'verification': json_app['Verification']
        }
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
