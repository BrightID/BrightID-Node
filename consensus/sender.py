import socket
import time
import json
from arango import ArangoClient
import config
from hiero_sdk_python import (
    Client,
    Network,
    AccountId,
    PrivateKey,
    TopicMessageSubmitTransaction,
    TopicId,
)

print(f"Connecting to Hedera {config.NETWORK} network!")
network = Network(config.NETWORK)
client = Client(network)
operator_id = AccountId.from_string(config.OPERATOR_ID)
operator_key = PrivateKey.from_string_ecdsa(config.OPERATOR_KEY)
client.set_operator(operator_id, operator_key)

db = ArangoClient(hosts=config.ARANGO_SERVER).db("_system")


def sendMessage(data):
    topic_id = TopicId.from_string(config.TOPIC_ID)
    message_transaction = (
        TopicMessageSubmitTransaction()
        .set_topic_id(topic_id)
        .set_message(data)
        .freeze_with(client)
        .sign(operator_key)
    )
    message_transaction.execute(client)


def main():
    operations = []
    hashes = []
    ignore = ["_id", "_rev", "state", "_key", "hash"]
    for op in db.collection("operations").find({"state": "init"}):
        d = {k: op[k] for k in op if k not in ignore}
        if len(json.dumps(operations)) + len(json.dumps(d)) > config.MAX_DATA_SIZE:
            break
        hashes.append(op["hash"])
        operations.append(d)
        print(d)

    if not operations:
        return

    data = json.dumps(operations)
    sendMessage(data)
    for i, op in enumerate(operations):
        db.collection("operations").update(
            {
                "_key": hashes[i],
                "state": "sent",
            },
            merge=True,
        )


def wait():
    while True:
        time.sleep(5)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex((config.BN_ARANGO_HOST, config.BN_ARANGO_PORT))
        sock.close()
        if result != 0:
            print("db is not running yet")
            continue
        # wait for ws to start upgrading foxx services and running setup script
        time.sleep(10)
        services = [service["name"] for service in db.foxx.services()]
        if "apply" not in services or "BrightID-Node" not in services:
            print("foxx services are not running yet")
            continue
        collections = [c["name"] for c in db.collections()]
        if "operations" not in collections:
            print("operations collection is not created yet")
            continue
        return


if __name__ == "__main__":
    print("waiting for db ...")
    wait()
    print("sender started ...")
    while True:
        try:
            main()
            time.sleep(1)
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(10)
            print("sender started ...")
