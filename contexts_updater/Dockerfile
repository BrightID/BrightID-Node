FROM ubuntu:16.04
RUN apt-get update
RUN apt-get install python3-pip cron curl -y
ADD . /code
WORKDIR /code/
RUN pip3 install -r requirements.txt

ADD update-cron /etc/cron.d/update-cron
RUN chmod 0644 /etc/cron.d/update-cron

CMD touch /var/log/cron.log && service cron start && tail -f /var/log/cron.log
