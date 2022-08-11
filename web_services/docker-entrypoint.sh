#!/bin/sh
set -eo pipefail
/wait-for.sh $BN_ARANGO_HOST:$BN_ARANGO_PORT

set +e
BN_WS_IP=${BN_WS_IP:-$(curl https://ipinfo.io/ip)}
set -e

## foxx config allows empty values, e.g. foxx config /brightid privateKey=
foxx server set default tcp://$BN_ARANGO_HOST:$BN_ARANGO_PORT
foxx upgrade /brightid5 /code/foxx/brightid5.zip ||
foxx install /brightid5 /code/foxx/brightid5.zip
foxx config /brightid5 ip=$BN_WS_IP
foxx config /brightid5 seed=$BN_SEED
foxx config /brightid5 publicKey=$BN_WS_PUBLIC_KEY
foxx config /brightid5 privateKey=$BN_WS_PRIVATE_KEY
foxx config /brightid5 ethPrivateKey=$BN_WS_ETH_PRIVATE_KEY
foxx config /brightid5 operationsTimeWindow=$BN_WS_OPERATIONS_TIME_WINDOW
foxx config /brightid5 operationsLimit=$BN_WS_OPERATIONS_LIMIT
foxx config /brightid5 appsOperationsLimit=$BN_WS_APPS_OPERATIONS_LIMIT

foxx upgrade /apply5 /code/foxx/apply5.zip ||
foxx install /apply5 /code/foxx/apply5.zip

foxx uninstall /brightid4
foxx uninstall /apply4
foxx uninstall /brightid3
foxx uninstall /apply3
