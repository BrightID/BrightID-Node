from web3 import Web3, HTTPProvider
from pyArango.connection import Connection
import config

db = Connection()['_system']
w3 = Web3(HTTPProvider(config.INFURA_URL))

sp_contract = w3.eth.contract(
    address=config.SP_ADDRESS,
    abi=config.SP_ABI)

brightid_contract = w3.eth.contract(
    address=config.BRIGHTID_ADDRESS,
    abi=config.BRIGHTID_ABI)


# FIXME: infura not supports filtering of events.
# Here we are hacking web3.py filters to use getLogs rpc endpoint instead.
def dummy(*args, **argsdic):
    if len(args) > 0 and args[0] == 'eth_newFilter':
        return 0
    else:
        return original_request_blocking(*args, **argsdic)


original_request_blocking = w3.manager.request_blocking
w3.manager.request_blocking = dummy


def str2bytes32(s):
    assert len(s) <= 32
    padding = (2 * (32 - len(s))) * '0'
    return (bytes(s, 'utf-8')).hex() + padding


def bytes32_to_string(b):
    b = b.hex().rstrip('0')
    if len(b) % 2 != 0:
        b = b + '0'
    return bytes.fromhex(b).decode('utf8')


def context_balance(context_name):
    b_context_name = str2bytes32(context_name)
    func = sp_contract.functions.totalContextBalance(
        b_context_name)
    balance = func.call({
        'from': config.ETH_CALL_SENDER,
    })
    return balance


def get_user_by_context_id(collection, context_id):
    aql_query = '''
        FOR r in {0}
        FILTER r.contextId == '{1}'
        RETURN r.user
    '''.format(collection, context_id)
    return db.AQLQuery(aql_query, rawResults=True)


def get_context(context_name):
    aql_query = '''
        FOR r in contexts
        FILTER r._key == '{0}'
        RETURN r
    '''.format(context_name)
    return db.AQLQuery(aql_query, rawResults=True)


def is_sponsored(user):
    aql_query = '''
        FOR r in sponsorships
        FILTER r._from == 'users/{0}'
        RETURN r
    '''.format(user)
    return bool(db.AQLQuery(aql_query, rawResults=True))


def user_has_verification(verification, user):
    aql_query = '''
        FOR r in users
        FILTER r._key == '{0}'
        RETURN r.verifications
    '''.format(user)
    verifications = db.AQLQuery(aql_query, rawResults=True)
    return bool(verifications and verification in verifications[0])


def context_has_sponsorship(context_name):
    aql_query = '''
        FOR r in contexts
        FILTER r._key == '{0}'
        RETURN r.totalSponsorships
    '''.format(context_name)
    total_sponsorships = db.AQLQuery(aql_query, rawResults=True)[0]

    aql_query = '''
        FOR r in sponsorships
        FILTER r._to == 'contexts/{0}'
        RETURN r
    '''.format(context_name)
    used_sponsorships = len(db.AQLQuery(aql_query, rawResults=True))
    return total_sponsorships - used_sponsorships > 0


def sponsor(context_name, user):
    edge_attr = {
        '_from': 'users/' + user,
        '_to': 'contexts/' + context_name
    }
    edge = db['sponsorships'].createDocument(edge_attr)
    edge.save()


def check_sponsor_requests():
    sponsored_filter = brightid_contract.events.SponsorRequested.createFilter(
        fromBlock=1, toBlock='latest', argument_filters=None)
    sponsored_logs = w3.eth.getLogs(sponsored_filter.filter_params)
    for sponsored_log in sponsored_logs:
        sponsored = sponsored_filter.format_entry(sponsored_log)
        context_name = bytes32_to_string(sponsored['args']['context'])
        context_id = bytes32_to_string(sponsored['args']['contextid'])
        context = get_context(context_name)
        if not context:
            continue

        user = get_user_by_context_id(context[0]['collection'], context_id)
        if not user:
            continue

        if is_sponsored(user[0]):
            continue

        if not user_has_verification(context[0]['verification'], user[0]):
            continue

        if not context_has_sponsorship(context_name):
            continue

        sponsor(context_name, user[0])


def main():
    contexts = db['contexts'].fetchAll()
    for context in contexts:
        context['totalSponsorships'] = context_balance(context['_key'])
        print(context['_key'], context['totalSponsorships'])
        context.save()
    check_sponsor_requests()


if __name__ == '__main__':
    main()
