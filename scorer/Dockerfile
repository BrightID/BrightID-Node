FROM ubuntu:20.04

ADD . /code
WORKDIR /code/

ADD https://download.arangodb.com/arangodb37/Community/Linux/arangodb3-client_3.7.5-1_amd64.deb ./
RUN dpkg -i arangodb3-client_3.7.5-1_amd64.deb
RUN apt update && apt -y install python3 python3-pip
ADD https://github.com/BrightID/BrightID-AntiSybil/archive/v1.2.1.tar.gz ./
RUN tar -xzf v1.2.1.tar.gz && rm v1.2.1.tar.gz
RUN pip3 install BrightID-AntiSybil-1.2.1/.
RUN pip3 install -r requirements.txt
CMD python3 -u runner.py
