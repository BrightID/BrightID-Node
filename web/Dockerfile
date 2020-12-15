FROM nginx:latest
# Determine which nginx-config to copy to the web image:
#  - If built with default docker-compose.yml, NGINXCONF is set to "brightid-nginx.conf".
#  - If built from dappnodeSDK using docker-compose-dappnode.yml, NGINXCONF arg is not set, so the dappnode config will
#    be used.
ARG NGINXCONF
ENV NGINXCONF=${NGINXCONF:-brightid-nginx-dappnode.conf}
COPY $NGINXCONF /etc/nginx/nginx.conf
