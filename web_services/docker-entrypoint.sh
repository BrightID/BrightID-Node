#!/bin/bash
set -eo pipefail

/wait-for.sh localhost:8529
foxx replace /brightid /code/foxx/brightid_1.0.0.zip || true
foxx config /brightid ip=`curl https://ipinfo.io/ip` || true

exit 0
