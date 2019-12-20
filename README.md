# Private Server Hub

PSH is a private cloud solution for home setups. This is not designed to run in a production environement, but serves as a convenient way to host your applications on your home server using Docker, and optionally expose those using NGinx as a reverse proxy.
PSH is designed to deploy micro service architecture type of applications using Docker, build on top of `docker-compose` as the container configuration and ortchestration engine.

## Solutions as packaged configurations

Build solution configurations that package multiple container configurations in order to deploy a complex solution environement. Let's say, you want to run a home media center solution, that runs your Plex server, your movies and series management servers and your download servers. Simply build a "Home Media Server" solution defining what containers and nginx configurations to package, and export that configuration so that you can share this with another person, or rebuild your environement on another machine as a backup. 

![Solution example](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/solution_example.png)

## Containers

List all your relevant docker images and configure containers to be run on your server.

![Containers](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/containers.png)  

![Container edit](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/container_edit.png)

## NGinx

Configure your NGinx reverse proxy to expose your docker container servers, or any other server on your network for that matter. Idealy, you would have a domain name, and map sub domains to individual containers on port 443, along with your SSL certificate for security.

![Nginx](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/nginx.png)  

![Nginx edit](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/nginx_edit.png)


# Install

```
sudo curl https://raw.githubusercontent.com/mdundek/psh-server/master/install.sh | sudo bash
```

<!-- # SSL Certificate

## Generate certificate

First, generate your wildcard certificate using certbot. Follow the instructions on this blog:
https://medium.com/@saurabh6790/generate-wildcard-ssl-certificate-using-lets-encrypt-certbot-273e432794d7

Once done, make sure your certificate files are listed under `/usr/local/private-server-hub/.letsencrypt/live/<your domain>/`.

## Test renewal

```
/usr/local/bin/certbot renew
```

## Setup auto-renew certificate

Open chron file with `crontab -e`, and add the following line at the end:

```
14 5 * * * /usr/local/bin/certbot renew --quiet --post-hook "docker container exec psh_nginx nginx -s reload" > /dev/null 2>&1
``` -->
