# 1st stage
FROM python:3.7-slim as builder
RUN apt-get update
RUN apt-get install -y --no-install-recommends build-essential gcc

ADD . /code
WORKDIR /code/
# Install with --user prefix so all installed packages are easy to copy in next stage
RUN pip3 install --user -r requirements.txt

# 2nd stage
FROM python:3.7-slim as runner
ADD . /code
WORKDIR /code/
ADD https://download.arangodb.com/arangodb37/Community/Linux/arangodb3-client_3.7.5-1_amd64.deb ./
RUN dpkg -i arangodb3-client_3.7.5-1_amd64.deb && rm arangodb3-client_3.7.5-1_amd64.deb
COPY docker-entrypoint.sh /usr/local/bin/
# Copy installed packages from 1st stage
COPY --from=builder /root/.local /root/.local
# Make sure scripts in .local are usable:
ENV PATH=/root/.local/bin:$PATH

# Always execute entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
