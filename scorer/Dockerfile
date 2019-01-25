FROM ubuntu:16.04
RUN apt-get update
RUN apt-get install python-pip cron curl -y
ADD . /code
WORKDIR /code/
RUN pip install -r requirements.txt

ADD runner-cron /etc/cron.d/runner-cron
RUN chmod 0644 /etc/cron.d/runner-cron

CMD touch /var/log/cron.log && service cron start && tail -f /var/log/cron.log
