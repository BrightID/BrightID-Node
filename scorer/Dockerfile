FROM ubuntu:20.04

ADD . /code
WORKDIR /code/

RUN apt update && apt -y install python3 python3-pip
ADD https://github.com/BrightID/BrightID-AntiSybil/archive/v.1.1.1.tar.gz ./
RUN tar -xzf BrightID-AntiSybil-v.1.1.1.tar.gz && rm BrightID-AntiSybil-v.1.1.1.tar.gz
RUN pip3 install BrightID-AntiSybil-v.1.1.1/.
RUN pip3 install -r requirements.txt
CMD python3 -u runner.py
