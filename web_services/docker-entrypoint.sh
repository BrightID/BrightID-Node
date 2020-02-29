#!/bin/bash
set -eo pipefail
/wait-for.sh localhost:8529

foxx upgrade /brightid /code/foxx/brightid_1.0.0.zip ||
foxx install /brightid /code/foxx/brightid_1.0.0.zip
foxx config /brightid ip=$BN_WS_IP
foxx config /brightid groupCheckInterval=$BN_WS_GROUP_CHECK_INTERVAL
foxx config /brightid publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid privateKey=$BN_WS_PRIVATE_KEY

foxx upgrade /brightid3 /code/foxx/brightid_3.0.0.zip ||
foxx install /brightid3 /code/foxx/brightid_3.0.0.zip
foxx config /brightid3 ip=$BN_WS_IP
foxx config /brightid3 groupCheckInterval=$BN_WS_GROUP_CHECK_INTERVAL
foxx config /brightid3 publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid3 privateKey=$BN_WS_PRIVATE_KEY

foxx upgrade /apply /code/foxx/apply_1.0.0.zip ||
foxx install /apply /code/foxx/apply_1.0.0.zip
