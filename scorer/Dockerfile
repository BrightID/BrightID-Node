FROM ubuntu:18.04

ADD . /code
WORKDIR /code/

RUN apt update && apt -y install python3 python3-pip cron curl
RUN pip3 install -r requirements.txt
CMD python3 -u runner.py
