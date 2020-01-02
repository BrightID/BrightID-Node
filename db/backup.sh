#!/bin/sh

PATH=/bin:/usr/bin:$PATH

cd /var/lib/arangodb3-apps

rm -rf dump
arangodump --output-directory dump --server.authentication false || exit 1

tar cvfz brightid.tar.gz dump
