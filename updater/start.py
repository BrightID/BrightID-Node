import time
import socket
from arango import ArangoClient
import apps
import seed_groups
import sponsorships

def wait():
    db = ArangoClient().db('_system')
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 8529))
        sock.close()
        if result != 0:
            print('db is not running yet')
            continue
        collections = [c['name'] for c in db.collections()]
        if 'apps' not in collections:
            print('apps collection is not created yet')
            continue
        return

if __name__ == '__main__':
    wait()
    apps.update()
    seed_groups.update()
    sponsorships.update()