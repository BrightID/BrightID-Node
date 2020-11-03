import zipfile
import json


def documents(f, collection):
    zf = zipfile.ZipFile(f)
    fnames = zf.namelist()
    def pattern(fname): return fname.endswith(
        '.data.json') and fname.count('/{}_'.format(collection)) > 0
    fname = list(filter(pattern, fnames))[0]
    content = zf.open(fname).read().decode('utf-8')
    ol = [json.loads(line) for line in content.split('\n') if line.strip()]
    d = {}
    for o in ol:
        if o['type'] == 2300:
            d[o['data']['_key']] = o['data']
        elif o['type'] == 2302 and o['data']['_key'] in d:
            del d[o['data']['_key']]
    return list(d.values())
