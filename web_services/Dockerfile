FROM node:8
ADD . /code
WORKDIR /code/profile/
RUN npm install
RUN npm install foxx-cli -g

RUN apt-get update && apt-get install -y netcat

COPY docker-entrypoint.sh /entrypoint.sh
COPY wait-for.sh /wait-for.sh

CMD /entrypoint.sh && nodejs app.js
EXPOSE 3000

