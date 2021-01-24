#!/bin/bash
# make BN_UPDATER_* and BN_ARANGO_* env vars available to cronjob
printenv | grep "BN_UPDATER\|BN_ARANGO\|PATH" > /tmp/environment_vars
python -u /code/start.py
