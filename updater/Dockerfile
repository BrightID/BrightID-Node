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
RUN apt-get update && \
    apt-get -y --no-install-recommends install cron

# Copy installed packages from 1st stage
COPY --from=builder /root/.local /root/.local
# Make sure scripts in .local are usable:
ENV PATH=/root/.local/bin:$PATH

ADD update-cron /etc/cron.d/update-cron
RUN chmod 0644 /etc/cron.d/update-cron

CMD /code/entrypoint.sh && touch /var/log/cron.log && service cron start && tail -f /var/log/cron.log
