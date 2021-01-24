FROM mhart/alpine-node:8

ADD . /code
WORKDIR /code/profile/

RUN npm install &&\
 npm install foxx-cli@1.3.0 -g &&\
 npm cache clean --force &&\
 apk add --update --no-cache netcat-openbsd curl

COPY docker-entrypoint.sh /entrypoint.sh
COPY wait-for.sh /wait-for.sh

CMD /entrypoint.sh && node server.js
