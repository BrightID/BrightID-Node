FROM ubuntu:20.04

ADD . /code
WORKDIR /code/

RUN apt update && apt -y install python3 python3-pip
ADD https://github.com/BrightID/BrightID-AntiSybil/archive/v1.1.0.tar.gz ./
RUN tar -xzf v1.1.0.tar.gz && rm v1.1.0.tar.gz
RUN pip3 install BrightID-AntiSybil-1.1.0/.
RUN pip3 install -r requirements.txt
CMD python3 -u runner.py
