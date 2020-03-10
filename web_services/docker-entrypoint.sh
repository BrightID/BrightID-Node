#!/bin/bash
set -eo pipefail
/wait-for.sh localhost:8529

set +e
BN_WS_IP=${BN_WS_IP:-$(curl https://ipinfo.io/ip)}
set -e

## foxx config allows empty values, e.g. foxx config /brightid privateKey=

foxx upgrade /brightid /code/foxx/brightid_1.0.0.zip ||
foxx install /brightid /code/foxx/brightid_1.0.0.zip
foxx config /brightid ip=$BN_WS_IP
foxx config /brightid publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid privateKey=$BN_WS_PRIVATE_KEY

foxx upgrade /brightid3 /code/foxx/brightid_3.0.0.zip ||
foxx install /brightid3 /code/foxx/brightid_3.0.0.zip
foxx config /brightid3 ip=$BN_WS_IP
foxx config /brightid3 publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid3 privateKey=$BN_WS_PRIVATE_KEY
foxx config /brightid3 ethPrivateKey=$BN_WS_ETH_PRIVATE_KEY

foxx upgrade /apply /code/foxx/apply_1.0.0.zip ||
foxx install /apply /code/foxx/apply_1.0.0.zip
