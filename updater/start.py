import time
import socket
from arango import ArangoClient
import apps
import seed_groups
import sponsorships
import config


def wait():
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(
            (config.BN_ARANGO_HOST, config.BN_ARANGO_PORT))
        sock.close()
        if result != 0:
            print('db is not running yet')
            continue
        # wait for ws to start upgrading foxx services and running setup script
        time.sleep(10)
        collections = [c['name'] for c in db.collections()]
        if 'apps' not in collections:
            print('apps collection is not created yet')
            continue
        services = [service['name'] for service in db.foxx.services()]
        if 'apply' not in services or 'BrightID-Node' not in services:
            print('foxx services are not running yet')
            continue
        return


if __name__ == '__main__':
    wait()
    apps.update()
    seed_groups.update()
    sponsorships.update()
