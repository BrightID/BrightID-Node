FROM node:8
ADD . /code
WORKDIR /code/BrightID-ws/
RUN npm install
RUN npm install foxx-cli -g
RUN bash -c "echo a > /code/pass"
CMD foxx install /brightid /code/foxx/brightid_1.0.0.zip -p /code/pass
CMD ["nodejs", "app.js"]
EXPOSE 3000
