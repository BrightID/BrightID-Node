#!/bin/bash
set -eo pipefail

/wait-for.sh localhost:8529
foxx upgrade /brightid /code/foxx/brightid_2.0.0.zip ||
foxx install /brightid /code/foxx/brightid_2.0.0.zip
foxx config /brightid ip=`curl https://ipinfo.io/ip`
