#!/bin/bash
set -eo pipefail
/wait-for.sh localhost:8529

set +e
BN_WS_IP=${BN_WS_IP:-$(curl https://ipinfo.io/ip)}
set -e

## foxx config allows empty values, e.g. foxx config /brightid privateKey=

foxx upgrade /brightid5 /code/foxx/brightid5.zip ||
foxx install /brightid5 /code/foxx/brightid5.zip
foxx config /brightid5 ip=$BN_WS_IP
foxx config /brightid5 publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid5 privateKey=$BN_WS_PRIVATE_KEY
foxx config /brightid5 ethPrivateKey=$BN_WS_ETH_PRIVATE_KEY

foxx upgrade /brightid4 /code/foxx/brightid4.zip ||
foxx install /brightid4 /code/foxx/brightid4.zip
foxx config /brightid4 ip=$BN_WS_IP
foxx config /brightid4 publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid4 privateKey=$BN_WS_PRIVATE_KEY
foxx config /brightid4 ethPrivateKey=$BN_WS_ETH_PRIVATE_KEY

foxx upgrade /apply5 /code/foxx/apply5.zip ||
foxx install /apply5 /code/foxx/apply5.zip

foxx upgrade /apply4 /code/foxx/apply4.zip ||
foxx install /apply4 /code/foxx/apply4.zip
