FROM node:8
ADD . /code
WORKDIR /code/BrightID-ws/
RUN npm install
RUN npm install foxx-cli -g
RUN bash -c "echo a > /code/pass"

RUN apt-get update && apt-get install -y netcat nginx

COPY docker-entrypoint.sh /entrypoint.sh
COPY wait-for.sh /wait-for.sh
RUN rm -rf /etc/nginx/sites-enabled/*
COPY brightid-nginx.conf /etc/nginx/sites-enabled/

CMD /entrypoint.sh && service nginx restart && nodejs app.js
EXPOSE 3000
EXPOSE 80

