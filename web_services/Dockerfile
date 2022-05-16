FROM mhart/alpine-node:16

ADD . /code
WORKDIR /code/profile/

# added "npm config set unsafe-perm true && \"
# because of following error in some docker configuration:
#   https://stackoverflow.com/a/52196681
RUN npm install &&\
 npm config set unsafe-perm true && \
 npm install foxx-cli@2.0.1 -g &&\
 npm cache clean --force &&\
 apk add --update --no-cache netcat-openbsd curl

COPY docker-entrypoint.sh /entrypoint.sh
COPY wait-for.sh /wait-for.sh

CMD /entrypoint.sh && node server.js
