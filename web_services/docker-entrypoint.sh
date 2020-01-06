#!/bin/bash
set -eo pipefail

/wait-for.sh localhost:8529
foxx upgrade /brightid /code/foxx/brightid_3.0.0.zip ||
foxx install /brightid /code/foxx/brightid_3.0.0.zip
foxx config /brightid ip=`curl https://ipinfo.io/ip`
foxx upgrade /apply /code/foxx/apply_1.0.0.zip ||
foxx install /apply /code/foxx/apply_1.0.0.zip
