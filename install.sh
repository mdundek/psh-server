#!/bin/bash

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




if [ "$DISTRO" == "Ubuntu" ]; then
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************** UBUNTU **************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************

    # *****************************************************************************
    # ********************************* GLOBAL ************************************
    # *****************************************************************************
    # add-apt-repository ppa:certbot/certbot -y
    apt-get update -y

    # apt-get install curl certbot apache2-utils python-pip python-certbot-nginx -y
    # pip install certbot-dns-cloudflare
    apt-get install curl apache2-utils -y
    
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi
    sleep 3

    if [ -x "$(command -v ufw)" ]; then
        ufw allow 80
        ufw allow 443
        ufw allow 16199
    fi

    # *****************************************************************************
    # ********************************* NODEJS ************************************
    # *****************************************************************************
    if [ -x "$(command -v node)" ]; then
        echo "------------------ => NodeJS already installed, skipping"
    else
        echo "------------------ => Installing NodeJS..."
        curl -sL https://deb.nodesource.com/setup_12.x | bash -
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
        apt-get install -y nodejs
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    # *****************************************************************************
    # *********************************** GIT *************************************
    # *****************************************************************************
    if [ -x "$(command -v git)" ]; then
        echo "------------------ => Git already installed, skipping"
    else
        echo "------------------ => Installing Git..."
        apt-get install -y git
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    # *****************************************************************************
    # *********************************** DOCKER **********************************
    # *****************************************************************************
    if [ -x "$(command -v docker)" ]; then
        echo "------------------ => Docker already installed, skipping"
    else
        echo "------------------ => Installing Docker..."
        # Install docker
        apt install -y docker.io
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
        # Auto start docker on boot
        systemctl start docker
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        systemctl enable docker
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    PSH_HOME_DIR="/usr/local/private-server-hub"
    # SERVER_URL="http://localhost"

    # *****************************************************************************
    # **************************** PRIVATE SERVER HUB *****************************
    # *****************************************************************************
    if [ -d "$PSH_HOME_DIR" ]; then
        rm -rf $PSH_HOME_DIR
    fi

    git clone https://gitlab.com/Dundek/private-server-hub.git $PSH_HOME_DIR
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi

    mkdir -p $PSH_HOME_DIR/.nginx/conf.d
    mkdir -p $PSH_HOME_DIR/.nginx/sites-enabled
    mkdir -p $PSH_HOME_DIR/.nginx/auth
    mkdir -p $PSH_HOME_DIR/.nginx/logs
    mkdir -p $PSH_HOME_DIR/.secrets
    mkdir -p $PSH_HOME_DIR/.letsencrypt

    cd $PSH_HOME_DIR/resources/nginx/docker/0.0.1
    docker build -t psh_nginx .
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi
    cp $PSH_HOME_DIR/resources/nginx/default.conf $PSH_HOME_DIR/.nginx/conf.d

    cd $PSH_HOME_DIR
    npm install
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi

    rm -rf .env
    cd $PSH_HOME_DIR/tools
    ./genVcap.js env=prod root=$PSH_HOME_DIR

    # *****************************************************************************
    # ****************************** DOCKER COMPOSE *******************************
    # *****************************************************************************
    if [ -x "$(command -v docker-compose)" ]; then
        echo "------------------ => Docker Compose already installed, skipping"
    else
        echo "------------------ => Installing Docker Compose..."
        # Install docker compose
        curl -L https://github.com/docker/compose/releases/download/1.25.0/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
    fi

    chmod +x /usr/local/bin/docker-compose
    chmod +x $PSH_HOME_DIR/resources/populateDockerHostIp.sh

    mkdir -p $PSH_HOME_DIR/.docker-compose
    cp $PSH_HOME_DIR/resources/docker-compose/docker-compose.yml $PSH_HOME_DIR/.docker-compose

    # *****************************************************************************
    # ************************************** PM2 **********************************
    # *****************************************************************************
    if [ -x "$(command -v pm2)" ]; then
        echo "------------------ => PM2 already installed, skipping installation"
        echo "------------------ => Please configure the psh-server application to run on your PS2 cluster using the following command from within the $PSH_HOME_DIR folder:"
        echo "------------------ => pm2 start . --name psh-server"    
    else
        echo "------------------ => Installing PM2..."
        # Install docker
        npm install pm2@latest -g
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        
        pm2 start . --name psh-server
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 5
        pm2 startup
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
        pm2 save
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 4

        # Disable local nginx instance
        if lsof -i:80 >/dev/null ; then
            STATUS=`systemctl is-active nginx`
            if [[ ${STATUS} == 'active' ]]; then
                systemctl stop nginx
                systemctl disable nginx
                echo "Your local NGinx server has been disabled, this was necessary in order to let the PSH Nginx server listen on that port."
            else
                echo "You have a server that is already listening on port 80. Please disable the server and run the script again."
                exit 1
            fi
        fi

        # Start docker-compose now
        cd "$PSH_HOME_DIR/.docker-compose"
        rm -rf .env
        echo 'DOCKERHOST='$(ip -4 addr show scope global dev docker0 | grep inet | awk '{print $2}' | cut -d / -f 1) > .env
        docker-compose up -d
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    # *****************************************************************************
    # ****************************** SETUP-SERVICES *******************************
    # *****************************************************************************

    echo "------------------ => PSH is installed and available on the following URL:"
    echo "------------------ => http://<host>/psh-admin"

elif [[ "$DISTRO" == *"redhat"*] || ["$DISTRO" == *"centos"* ]]; then
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************** REDHAT / CENTOS *****************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************
    # ******************************************************************************************************

    VERSION=`hostnamectl | grep "Operating System"`
    if [[ $VERSION != *"Linux 7"* && $VERSION != *"Linux 8"* ]]; then
        echo "Unsupported linux version, only version 7 & 8 are supported at the moment"
        exit 1
    fi

    yum update -y
    yum install curl gcc-c++ make yum-utils device-mapper-persistent-data lvm2 lsof -y

    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi
    sleep 3

    # *****************************************************************************
    # ********************************* NODEJS ************************************
    # *****************************************************************************
    if [ -x "$(command -v node)" ]; then
        echo "------------------ => NodeJS already installed, skipping"
    else
        echo "------------------ => Installing NodeJS..."
        curl -sL https://rpm.nodesource.com/setup_12.x | sudo -E bash -
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
        yum install nodejs -y
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    # *****************************************************************************
    # *********************************** GIT *************************************
    # *****************************************************************************
    if [ -x "$(command -v git)" ]; then
        echo "------------------ => Git already installed, skipping"
    else
        echo "------------------ => Installing Git..."
        yum install -y git
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    # *****************************************************************************
    # *********************************** DOCKER **********************************
    # *****************************************************************************
    if [ -x "$(command -v docker)" ]; then
        echo "------------------ => Docker already installed, skipping"
    else
        echo "------------------ => Installing Docker..."
        # Install docker
        VERSION=`hostnamectl | grep "Operating System"`
        if [[ $VERSION == *"Linux 7"* ]]; then
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            yum install docker -y
        elif [[ $VERSION == *"Linux 8"* ]]; then
            dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
            dnf install docker-ce --nobest -y
        fi

        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
        # Auto start docker on boot
        systemctl start docker
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        systemctl enable docker
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    PSH_HOME_DIR="/usr/local/private-server-hub"

    # *****************************************************************************
    # **************************** PRIVATE SERVER HUB *****************************
    # *****************************************************************************
    if [ -d "$PSH_HOME_DIR" ]; then
        rm -rf $PSH_HOME_DIR
    fi

    git clone https://gitlab.com/Dundek/private-server-hub.git $PSH_HOME_DIR
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi

    mkdir -p $PSH_HOME_DIR/.nginx/conf.d
    mkdir -p $PSH_HOME_DIR/.nginx/sites-enabled
    mkdir -p $PSH_HOME_DIR/.nginx/auth
    mkdir -p $PSH_HOME_DIR/.nginx/logs
    mkdir -p $PSH_HOME_DIR/.secrets
    mkdir -p $PSH_HOME_DIR/.letsencrypt

    cd $PSH_HOME_DIR/resources/nginx/docker/0.0.1
    docker build -t psh_nginx .
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi
    cp $PSH_HOME_DIR/resources/nginx/default.conf $PSH_HOME_DIR/.nginx/conf.d

    cd $PSH_HOME_DIR
    npm install
    if [ $? -ne 0 ]; then
        echo "=> An error occured, aboarding installation"
        exit 1
    fi

    rm -rf .env
    cd $PSH_HOME_DIR/tools
    ./genVcap.js env=prod root=$PSH_HOME_DIR

    # *****************************************************************************
    # ****************************** DOCKER COMPOSE *******************************
    # *****************************************************************************
    if [ -x "$(command -v docker-compose)" ]; then
        echo "------------------ => Docker Compose already installed, skipping"
    else
        echo "------------------ => Installing Docker Compose..."
        # Install docker compose
        curl -L https://github.com/docker/compose/releases/download/1.25.0/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
    fi

    chmod +x /usr/local/bin/docker-compose
    chmod +x $PSH_HOME_DIR/resources/populateDockerHostIp.sh

    mkdir -p $PSH_HOME_DIR/.docker-compose
    cp $PSH_HOME_DIR/resources/docker-compose/docker-compose.yml $PSH_HOME_DIR/.docker-compose

    # *****************************************************************************
    # ************************************** PM2 **********************************
    # *****************************************************************************
    if [ -x "$(command -v pm2)" ]; then
        echo "------------------ => PM2 already installed, skipping installation"
        echo "------------------ => Please configure the psh-server application to run on your PS2 cluster using the following command from within the $PSH_HOME_DIR folder:"
        echo "------------------ => pm2 start . --name psh-server"    
    else
        echo "------------------ => Installing PM2..."
        # Install docker
        npm install pm2@latest -g
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        
        pm2 start . --name psh-server
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 5
        pm2 startup
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 1
        pm2 save
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
        sleep 4

        # Disable local nginx instance
        if lsof -i:80 >/dev/null ; then
            STATUS=`systemctl is-active nginx`
            if [[ ${STATUS} == 'active' ]]; then
                systemctl stop nginx
                systemctl disable nginx
                echo "Your local NGinx server has been disabled, this was necessary in order to let the PSH Nginx server listen on that port."
            else
                echo "You have a server that is already listening on port 80. Please disable the server and run the script again."
                exit 1
            fi
        fi

        # Start docker-compose now
        cd "$PSH_HOME_DIR/.docker-compose"
        rm -rf .env
        echo 'DOCKERHOST='$(ip -4 addr show scope global dev docker0 | grep inet | awk '{print $2}' | cut -d / -f 1) > .env
        docker-compose up -d
        if [ $? -ne 0 ]; then
            echo "=> An error occured, aboarding installation"
            exit 1
        fi
    fi

    # *****************************************************************************
    # ****************************** SETUP-SERVICES *******************************
    # *****************************************************************************

    echo "------------------ => PSH is installed and available on the following URL:"
    echo "------------------ => http://<host>/psh-admin"
else
    echo "Unsupported linux system: $DISTRO"
    exit 1
fi