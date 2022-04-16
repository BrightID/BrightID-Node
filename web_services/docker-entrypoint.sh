#!/bin/sh
set -eo pipefail
/wait-for.sh $BN_ARANGO_HOST:$BN_ARANGO_PORT

## foxx config allows empty values, e.g. foxx config /brightid privateKey=
foxx server set default tcp://$BN_ARANGO_HOST:$BN_ARANGO_PORT

foxx upgrade /brightid5 /code/foxx/brightid5.zip ||
foxx install /brightid5 /code/foxx/brightid5.zip
foxx config /brightid5 privateKey=$BN_WS_PRIVATE_KEY
foxx config /brightid5 ethPrivateKey=$BN_WS_ETH_PRIVATE_KEY
foxx config /brightid5 operationsTimeWindow=$BN_WS_OPERATIONS_TIME_WINDOW
foxx config /brightid5 operationsLimit=$BN_WS_OPERATIONS_LIMIT

foxx upgrade /apply5 /code/foxx/apply5.zip ||
foxx install /apply5 /code/foxx/apply5.zip

foxx upgrade /brightid6 /code/foxx/brightid6.zip ||
foxx install /brightid6 /code/foxx/brightid6.zip
foxx config /brightid6 seed=$SEED
foxx config /brightid6 wISchnorrPassword=$BN_WS_WISCHNORR_PASSWORD
foxx config /brightid6 privateKey=$BN_WS_PRIVATE_KEY
foxx config /brightid6 ethPrivateKey=$BN_WS_ETH_PRIVATE_KEY
foxx config /brightid6 consensusSenderPrivateKey=$BN_CONSENSUS_PRIVATE_KEY
foxx config /brightid6 operationsTimeWindow=$BN_WS_OPERATIONS_TIME_WINDOW
foxx config /brightid6 operationsLimit=$BN_WS_OPERATIONS_LIMIT

foxx upgrade /apply6 /code/foxx/apply6.zip ||
foxx install /apply6 /code/foxx/apply6.zip

foxx uninstall /brightid4
foxx uninstall /apply4
foxx uninstall /brightid3
foxx uninstall /apply3
