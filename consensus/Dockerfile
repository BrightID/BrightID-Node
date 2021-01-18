FROM ubuntu:18.04

COPY docker-entrypoint.sh /usr/local/bin/

ADD . /code
WORKDIR /code/

ADD https://download.arangodb.com/arangodb37/Community/Linux/arangodb3-client_3.7.5-1_amd64.deb ./
RUN dpkg -i arangodb3-client_3.7.5-1_amd64.deb

RUN apt update && apt -y install python3 python3-pip
RUN pip3 install -r requirements.txt

# Always execute entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
