#!/bin/bash
# make BN_UPDATER_* and BN_ARANGO_* env vars available to cronjob
printenv | grep "BN_UPDATER\|BN_ARANGO" > /tmp/environment_vars
python3 -u /code/start.py

