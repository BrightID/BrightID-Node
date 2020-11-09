import time
import base64
import requests
import traceback
from arango import ArangoClient
import config

db = ArangoClient().db('_system')


def update():
    print('Updating applications', time.ctime())
    local_apps = {}
    for app in db['apps']:
        local_apps[app['name']] = app
    apps = requests.get(config.APPS_JSON_FILE).json()['Applications']
    for app in apps:
        name = app['Application']
        app_updated = False
        try:
            res = requests.get(app['Images'][0])
            file_format = app['Images'][0].split('.')[-1]
            logo = 'data:image/' + file_format + ';base64,' + \
                base64.b64encode(res.content).decode('ascii')
        except Exception as e:
            print('Error in getting logo', e)
            logo = ''
        if name not in local_apps:
            print(f'Insert new app: {name}')
            try:
                db['apps'].insert({
                    '_key': name.replace(' ', ''),
                    'name': name,
                    'context': app['Context'],
                    'url': app['Links'][0],
                    'logo': logo,
                    'sponsorPublicKey': app['Sponsor Public Key'],
                    'sponsorEventContract': app['Contract Address'],
                    'wsProvider': app['Websocket Endpoint']
                })
            except Exception as e:
                print(f'Error in inserting new app: {e}')
                traceback.print_exc()
            finally:
                continue
        if app['Context'] != local_apps[name].get('context', ''):
            app_updated = True
        elif app['Links'][0] != local_apps[name].get('url', ''):
            app_updated = True
        elif app['Sponsor Public Key'] != local_apps[name].get('sponsorPublicKey', ''):
            app_updated = True
        elif app['Contract Address'] != local_apps[name].get('sponsorEventContract', ''):
            app_updated = True
        elif app['Websocket Endpoint'] != local_apps[name].get('wsProvider', ''):
            app_updated = True
        if app_updated:
            print(f'Updating {name} data')
            db['apps'].update({
                '_key': local_apps[name]['_key'],
                'context': app['Context'],
                'url': app['Links'][0],
                'sponsorPublicKey': app['Sponsor Public Key'],
                'sponsorEventContract': app['Contract Address'],
                'wsProvider': app['Websocket Endpoint']
            })
        if logo and logo != local_apps[name]['logo']:
            print(f'Updating {name} logo')
            db['apps'].update({
                '_key': local_apps[name]['_key'],
                'logo': logo
            })


if __name__ == '__main__':
    try:
        update()
    except Exception as e:
        print(f'Error in updater: {e}')
        traceback.print_exc()
