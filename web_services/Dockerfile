FROM mhart/alpine-node:16 as builder

ADD . /code
WORKDIR /code/profile/

RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*
RUN npm install &&\
 npm cache clean --force

FROM mhart/alpine-node:16 as runner
ADD . /code
WORKDIR /code/profile/
# added "npm config set unsafe-perm true && \"
# because of following error in some docker configuration:
#   https://stackoverflow.com/a/52196681
RUN npm config set unsafe-perm true && \
 npm install foxx-cli@2.0.1 -g && \
 apk add --update --no-cache netcat-openbsd curl

COPY docker-entrypoint.sh /entrypoint.sh
COPY wait-for.sh /wait-for.sh
COPY --from=builder /code/profile/node_modules /code/profile/node_modules

CMD /entrypoint.sh && node server.js
