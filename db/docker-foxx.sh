#!/bin/sh
# Edited from https://github.com/arangodb/arangodb-docker/blob/official/alpine/3.8.6/docker-foxx.sh
test -d /tmp/foxx || mkdir -m 700 /tmp/foxx
export HOME=/tmp/foxx
exec /usr/local/share/.config/yarn/global/node_modules/.bin/foxx "$@"
