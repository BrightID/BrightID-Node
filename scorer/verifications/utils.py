import base64
from hashlib import sha256


def hash(name, user, rank=''):
    message = (name + user + str(rank)).encode('ascii')
    h = base64.b64encode(sha256(message).digest()).decode("ascii")
    return h.replace('/', '_').replace('+', '-').replace('=', '')
