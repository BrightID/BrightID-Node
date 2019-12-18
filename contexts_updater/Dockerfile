FROM ubuntu:16.04

RUN apt-get update
RUN apt-get update && \
  apt-get install -y software-properties-common && \
  add-apt-repository ppa:jonathonf/python-3.6
RUN apt-get update

RUN apt-get install -y build-essential python3.6 python3.6-dev python3-pip cron curl
RUN python3.6 -m pip install pip --upgrade

ADD . /code
WORKDIR /code/
RUN python3.6 -m pip install pip --upgrade
RUN python3.6 -m pip install -r requirements.txt

ADD update-cron /etc/cron.d/update-cron
RUN chmod 0644 /etc/cron.d/update-cron

CMD touch /var/log/cron.log && service cron start && tail -f /var/log/cron.log
