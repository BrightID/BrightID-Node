#!/bin/bash
set -e

echo "consensus RUN_TYPE: $RUN_TYPE"

if [ "$RUN_TYPE" = "SENDER" ] ; then
  if [ "$BN_CONSENSUS_PRIVATE_KEY" != "" ] ; then
    echo "Starting in SENDER mode"
    exec python3 -u sender.py
  else
    echo "Ignore starting sender because BN_CONSENSUS_PRIVATE_KEY is not set"
  fi
elif [ "$RUN_TYPE" = "RECEIVER" ] ; then
  echo "Starting in RECEIVER mode"
  exec python3 -u receiver.py
else
  echo "Unknown RUN_TYPE $RUN_TYPE"
fi
