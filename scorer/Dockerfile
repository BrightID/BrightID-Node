FROM ubuntu:16.04
RUN apt-get update
RUN apt-get install python-pip cron curl -y
RUN pip install --upgrade pip
ADD . /code
WORKDIR /code/
RUN pip install -r requirements.txt

CMD touch /var/log/cron.log && service cron start && tail -f /var/log/cron.log
