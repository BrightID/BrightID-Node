FROM node:8
ADD . /code
WORKDIR /code/BrightID-ws/
RUN npm install
RUN npm install pm2 -g
CMD ["nodejs", "app.js"]
EXPOSE 3000
