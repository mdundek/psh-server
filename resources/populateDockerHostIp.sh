#!/bin/bash

# Sets the DOCKERHOST env variable for docker-compose .env file (not the .env of PSH server)

cd "$1"
rm -rf .env
echo 'DOCKERHOST='$(ip -4 addr show scope global dev docker0 | grep inet | awk '{print $2}' | cut -d / -f 1) > .env