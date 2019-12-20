#!/bin/bash

# Sets the DOCKERHOST env variable for docker-compose .env file (not the .env of PSH server)

if [[ "$OSTYPE" == "linux-gnu" ]]; then
    # If available, use LSB to identify distribution
    if [ -f /etc/lsb-release -o -d /etc/lsb-release.d ]; then
        export DISTRO=$(lsb_release -i | cut -d: -f2 | sed s/'^\t'//)
    # Otherwise, use release info file
    else
        export DISTRO=$(ls -d /etc/[A-Za-z]*[_-][rv]e[lr]* | grep -v "lsb" | cut -d'/' -f3 | cut -d'-' -f1 | cut -d'_' -f1 | tr "\n" " ")
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    export DISTRO="OSX"
else
    echo "Unsupported operating system: $OSTYPE"
    exit 1
fi

cd "$1"
rm -rf .env

if [ "$DISTRO" == "Ubuntu" ]; then
    echo 'DOCKERHOST='$(ip -4 addr show scope global dev docker0 | grep inet | awk '{print $2}' | cut -d / -f 1) > .env
elif [[ "$DISTRO" == *"redhat"*] || ["$DISTRO" == *"centos"* ]]; then
    echo 'DOCKERHOST='$(ip -4 addr show scope global dev docker0 | grep inet | awk '{print $2}' | cut -d / -f 1) > .env
fi