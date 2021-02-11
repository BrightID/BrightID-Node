# 1st stage
FROM python:3.7 as builder

ADD . /code
WORKDIR /code/
# Install with --user prefix so all installed packages are easy to copy in next stage
RUN pip3 install --user -r requirements.txt

# 2nd stage
FROM python:3.7-slim as runner
ADD . /code
WORKDIR /code/
ADD https://download.arangodb.com/arangodb36/Community/Linux/arangodb3-client_3.6.4-1_amd64.deb ./
RUN dpkg -i arangodb3-client_3.6.4-1_amd64.deb && rm arangodb3-client_3.6.4-1_amd64.deb
COPY docker-entrypoint.sh /usr/local/bin/
# Copy installed packages from 1st stage
COPY --from=builder /root/.local /root/.local
# Make sure scripts in .local are usable:
ENV PATH=/root/.local/bin:$PATH

# Always execute entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
