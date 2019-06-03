# based on https://github.com/arangodb/arangodb-docker/blob/official/alpine/3.4.0/Dockerfile

# CHANGES:

# - add extra GPG keyserver to return ipv4 addresses
# - remove the conversion of endpoints from 127.0.0.1 to 0.0.0.0

# - set ARANGO_NO_AUTH to 1
# - copy dumps

FROM alpine:3.8

ENV ARANGO_NO_AUTH 1

ENV ARANGO_VERSION 3.4.0
ENV ARANGO_URL https://download.arangodb.com/arangodb34/DEBIAN/amd64
ENV ARANGO_PACKAGE arangodb3_${ARANGO_VERSION}-1_amd64.deb
ENV ARANGO_PACKAGE_URL ${ARANGO_URL}/${ARANGO_PACKAGE}
ENV ARANGO_SIGNATURE_URL ${ARANGO_PACKAGE_URL}.asc

RUN apk add --no-cache gnupg pwgen nodejs npm binutils && \
    npm install -g foxx-cli && \
    rm -rf /root/.npm

RUN GPG_KEYS=CD8CB0F1E0AD5B52E93F41E7EA93F5E56E751E9B && \
   ( gpg --keyserver ipv4.pool.sks-keyservers.net --recv-keys "$GPG_KEYS" \
  || gpg --keyserver hkps://hkps.pool.sks-keyservers.net --recv-keys "$GPG_KEYS" )

RUN mkdir /docker-entrypoint-initdb.d

# see
#   https://docs.arangodb.com/latest/Manual/Administration/Configuration/Endpoint.html
#   https://docs.arangodb.com/latest/Manual/Administration/Configuration/Logging.html

RUN cd /tmp                                && \
    wget ${ARANGO_SIGNATURE_URL}           && \
    wget ${ARANGO_PACKAGE_URL}             && \
    gpg --verify ${ARANGO_PACKAGE}.asc     && \
    ar x ${ARANGO_PACKAGE} data.tar.gz     && \
    tar -C / -x -z -f data.tar.gz          && \
    sed -ri \
        -e 's!^(file\s*=).*!\1 -!' \
        -e 's!^\s*uid\s*=.*!!' \
        /etc/arangodb3/arangod.conf        && \
    echo chgrp 0 /var/lib/arangodb3 /var/lib/arangodb3-apps && \
    echo chmod 775 /var/lib/arangodb3 /var/lib/arangodb3-apps && \
    rm -f ${ARANGO_PACKAGE}* data.tar.gz
# Note that Openshift runs containers by default with a random UID and GID 0.
# We need that the database and apps directory are writable for this config.

# retain the database directory and the Foxx Application directory
VOLUME ["/var/lib/arangodb3", "/var/lib/arangodb3-apps"]

COPY docker-entrypoint.sh /entrypoint.sh

COPY backup.sh /etc/periodic/daily/backup.sh
RUN chmod +x /etc/periodic/daily/backup.sh
RUN crond

ADD . /code
WORKDIR /code/
RUN mkdir -p /docker-entrypoint-initdb.d/dumps/_system/ && cp dumps/* /docker-entrypoint-initdb.d/dumps/_system/

ENTRYPOINT ["/entrypoint.sh"]

# standard port
EXPOSE 8529
CMD ["arangod", "--server.maximal-threads=16"]
