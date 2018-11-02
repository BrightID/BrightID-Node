#!/bin/bash
set -eo pipefail

/wait-for.sh localhost:8529
foxx install /brightid /code/foxx/brightid_1.0.0.zip -p /code/pass || true

exit 0
