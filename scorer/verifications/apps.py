import time
from arango import ArangoClient
from py_expression_eval import Parser
import config

def verify(block):
    print('Update verifications for apps')
    db = ArangoClient(hosts=config.ARANGO_SERVER).db('_system')
    parser = Parser()
    apps = {app["_key"]: app['verification']
            for app in db['apps'] if app.get('verification')}
    batch_db = db.begin_batch_execution(return_result=True)
    batch_col = batch_db.collection('verifications')
    counter = 0
    for user in db['users']:
        verifications = {}
        for v in db['verifications'].find({'block': block, 'user': user['_key']}):
            verifications[v['name']] = True
            for k in v:
                if k in ['_key', '_id', '_rev', 'user', 'name']:
                    continue
                verifications[f'{v["name"]}.{k}'] = v[k]

        for app in apps:
            try:
                expr = parser.parse(apps[app])
                variables = expr.variables()
                verifications.update(
                    {k: False for k in variables if k not in verifications})
                verified = expr.evaluate(verifications)
            except:
                print('invalid verification expression')
                continue

            if verified:
                batch_col.insert({
                    'app': True,
                    'name': app,
                    'user': user['_key'],
                    'block': block,
                    'timestamp': int(time.time() * 1000)
                })
                counter += 1
                if counter % 1000 == 0:
                    batch_db.commit()
                    batch_db = db.begin_batch_execution(return_result=True)
                    batch_col = batch_db.collection('verifications')
    batch_db.commit()
