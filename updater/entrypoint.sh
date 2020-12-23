#!/bin/bash
printenv | grep "BN_UPDATER" > /tmp/environment_vars
python3 -u /code/start.py
