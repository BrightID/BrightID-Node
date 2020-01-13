FROM ubuntu:18.04

ADD . /code
WORKDIR /code/

RUN apt update && apt -y install python3 python3-pip cron supervisor
RUN pip3 install -r requirements.txt
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
CMD ["/usr/bin/supervisord"]
