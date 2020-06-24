#!/bin/sh
# Edited from https://github.com/arangodb/arangodb-docker/blob/official/alpine/3.6.4/docker-foxx.sh
test -d /tmp/foxx || mkdir -m 700 /tmp/foxx
export HOME=/tmp/foxx
exec /usr/lib/node_modules/foxx-cli/bin/foxx "$@"