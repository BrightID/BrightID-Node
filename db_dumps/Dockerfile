FROM arangodb/arangodb
ENV ARANGO_ROOT_PASSWORD=a
ADD . /code
WORKDIR /code/
RUN mkdir -p /docker-entrypoint-initdb.d/dumps & mkdir -p /docker-entrypoint-initdb.d/dumps/_system/ & cp -r db/* /docker-entrypoint-initdb.d/dumps/_system/
EXPOSE 8529
