FROM ubuntu:18.04

RUN apt-get update -y && apt-get upgrade -y

# Install Nginx.
RUN apt-get install -y nginx

# Install Let's encrypt
RUN apt-get install software-properties-common nano curl -y && add-apt-repository ppa:certbot/certbot && apt-get update
# && apt-get install python-certbot-nginx -y && certbot --nginx -d devtest1.com -d www.devtest1.com

RUN mkdir -p /etc/letsencrypt
RUN mkdir -p /etc/nginx/auth

# Define mountable directories.
VOLUME ["/etc/nginx/sites-enabled", "/etc/nginx/conf.d", "/var/log/nginx", "/var/www/html", "/etc/letsencrypt", "/etc/nginx/auth"]

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# COPY setup-certbot.sh /usr/local/bin/setup-certbot.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# RUN chmod +x /usr/local/bin/setup-certbot.sh

# EXPOSE 80
# EXPOSE 443

STOPSIGNAL SIGTERM

#CMD ["nginx", "-g", "daemon off;"]

ENTRYPOINT ["docker-entrypoint.sh"]