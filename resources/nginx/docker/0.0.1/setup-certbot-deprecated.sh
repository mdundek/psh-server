#!/bin/bash

if [ "$1" = "" ]; then
  echo "Missing domain name parameter";
else
  apt-get install python-certbot-nginx -y
  certbot --nginx -d $1 -d www.$1
  nginx -s reload
fi