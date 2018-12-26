#!/bin/bash
set -eo pipefail

/wait-for.sh localhost:8529
foxx uninstall /brightid
foxx install /brightid /code/foxx/brightid_1.0.0.zip
foxx config /brightid ip=`curl https://ipinfo.io/ip`

exit 0
