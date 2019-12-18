FROM ubuntu:18.04

ADD . /code
WORKDIR /code/

RUN apt update && apt -y install python3 python3-pip cron
RUN pip3 install -r requirements.txt

ADD update-cron /etc/cron.d/update-cron
RUN chmod 0644 /etc/cron.d/update-cron

CMD touch /var/log/cron.log && service cron start && tail -f /var/log/cron.log
