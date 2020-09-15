FROM ubuntu:18.04

ADD . /code
WORKDIR /code/

RUN apt update && apt -y install python3 python3-pip
RUN pip3 install -r requirements.txt
