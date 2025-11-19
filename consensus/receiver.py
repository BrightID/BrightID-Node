import os
import time
import math
import socket
import json
import base64
import hashlib
import shutil
import requests
import traceback
from arango import ArangoClient, errno
import config

db = ArangoClient(hosts=config.ARANGO_SERVER).db("_system")
variables = db.collection("variables")


def hash(op):
    op = {
        k: op[k]
        for k in op
        if k not in ("sig", "sig1", "sig2", "sig3", "sig4", "sig5", "hash", "blockTime")
    }
    if op["name"] == "Set Signing Key":
        del op["id1"]
        del op["id2"]

    if op["name"] == "Social Recovery" and op["v"] == 6:
        for k in ["id1", "id2", "id3", "id4", "id5"]:
            op.pop(k, None)
    message = json.dumps(op, sort_keys=True, separators=(",", ":"))
    m = hashlib.sha256()
    m.update(message.encode("ascii"))
    h = base64.b64encode(m.digest()).decode("ascii")
    return h.replace("+", "-").replace("/", "_").replace("=", "")


def process(message):
    encoded_message = message.get("message", "")
    message_content = base64.b64decode(encoded_message).decode("utf-8").strip()

    try:
        operations = json.loads(message_content)
    except ValueError:
        print("error in parsing operations", message_content)
        return
    for op in operations:
        if type(op) is not dict or op.get("v") not in (5, 6) or "name" not in op:
            print("invalid operation", op)
            continue
        op["blockTime"] = int(float(message["consensus_timestamp"]) * 1000)
        process_op(op)


def process_op(op):
    print(op)
    url = config.APPLY_URL.format(v=op["v"], hash=hash(op))
    r = requests.put(url, json=op)
    resp = r.json()
    print(resp)
    # resp is returned from PUT /operations handler
    if resp.get("state") == "failed":
        if resp["result"].get("arangoErrorNum") == errno.CONFLICT:
            print("retry on conflict")
            return process_op(op)
    # resp is returned from arango not PUT /operations handler
    # joi errors (bad request errors) have code 400
    if resp.get("error") and resp.get("code") != 400:
        raise Exception("Error from apply service")


def save_snapshot(next_snapshot_timestamp):
    dir_name = config.SNAPSHOTS_PATH.format(int(next_snapshot_timestamp / 1000))
    fnl_dir_name = f"{dir_name}_fnl"
    dir_path = os.path.dirname(os.path.realpath(__file__))
    collections_file = os.path.join(dir_path, "collections.json")
    res = os.system(
        f'arangodump --overwrite true --compress-output false --server.password "" --server.endpoint "tcp://{config.BN_ARANGO_HOST}:{config.BN_ARANGO_PORT}" --output-directory {dir_name} --maskings {collections_file}'
    )
    assert res == 0, "dumping snapshot failed"
    shutil.move(dir_name, fnl_dir_name)
    variables.update({"_key": "PREV_SNAPSHOT_TIME", "value": next_snapshot_timestamp})
    remove_old_operations()


def remove_old_operations():
    print("Removing operations older than 30 days")
    border = int(time.time() * 1000) - 30 * 24 * 60 * 60 * 1000
    print(border)
    db.aql.execute(
        """
        FOR o IN operations
            FILTER  o.timestamp < @border
            REMOVE o IN operations
        """,
        bind_vars={"border": border},
    )


def get_sequence_number():
    if variables.has("SEQUENCE_NUMBER"):
        return variables.get("SEQUENCE_NUMBER")["value"]
    else:
        variables.insert({"_key": "SEQUENCE_NUMBER", "value": 7})
        return 7


def get_next_snapshot_timestamp(sequence_number):
    if variables.has("PREV_SNAPSHOT_TIME"):
        return variables.get("PREV_SNAPSHOT_TIME")["value"] + config.SNAPSHOTS_PERIOD_MILLISECONDS
    else:
        url = config.MIRROR_NODE_URL.format(
            topic_id=config.TOPIC_ID, sequence_number=sequence_number, limit=1
        )
        r = requests.get(url)
        messages = r.json()["messages"]
        if len(messages) == 0:
            raise Exception("no genesis message! consensus receiver stopped ...")

        timestamp = int(float(messages[0]["consensus_timestamp"]) * 1000)
        prev_snapshot_timestamp = (
            int(timestamp / config.SNAPSHOTS_PERIOD_MILLISECONDS) * config.SNAPSHOTS_PERIOD_MILLISECONDS
        )
        variables.insert(
            {"_key": "PREV_SNAPSHOT_TIME", "value": prev_snapshot_timestamp}
        )
        return prev_snapshot_timestamp + config.SNAPSHOTS_PERIOD_MILLISECONDS


def main():
    sequence_number = get_sequence_number()
    next_snapshot_timestamp = get_next_snapshot_timestamp(sequence_number)

    while True:
        time.sleep(1)
        url = config.MIRROR_NODE_URL.format(
            topic_id=config.TOPIC_ID,
            sequence_number="gt:{}".format(sequence_number),
            limit=100,
        )
        r = requests.get(url)

        messages = r.json()["messages"]
        for i, message in enumerate(messages):
            consensus_timestamp = int(float(message["consensus_timestamp"]) * 1000)
            if next_snapshot_timestamp <= consensus_timestamp:
                save_snapshot(next_snapshot_timestamp)
            while next_snapshot_timestamp <= consensus_timestamp:
                next_snapshot_timestamp += config.SNAPSHOTS_PERIOD_MILLISECONDS
                print(f"next snapshot timestamp will be {next_snapshot_timestamp}")

            process(message)
            sequence_number = message["sequence_number"]
            variables.update({"_key": "SEQUENCE_NUMBER", "value": sequence_number})

        now = time.time() * 1000
        allowed_delay = min(config.SNAPSHOTS_PERIOD_MILLISECONDS / 2, 60 * 1000)

        if len(messages) == 0 and now > next_snapshot_timestamp + allowed_delay:
            save_snapshot(next_snapshot_timestamp)
            next_snapshot_timestamp += config.SNAPSHOTS_PERIOD_MILLISECONDS


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
        if "apps" not in collections:
            print("apps collection is not created yet")
            continue
        apps = [app for app in db.collection("apps")]
        if len(apps) == 0:
            print("apps collection is not loaded yet")
            continue
        return


if __name__ == "__main__":
    while True:
        try:
            print("waiting for db ...")
            wait()
            print("receiver started ...")
            main()
        except Exception as e:
            print(f"Error: {e}")
            print(f"Traceback: {traceback.format_exc()}")
            time.sleep(10)
