# Private Server Hub

PSH is a private cloud solution for home setups. This is not designed to run in a production environement, but serves as a convenient way to host your applications on your home server using Docker, and optionally expose those using NGinx as a reverse proxy.
PSH is designed to deploy micro service architecture type of applications using Docker, build on top of `docker-compose` as the container configuration and ortchestration engine.

![Solution](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/solution.png)
![Containers](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/containers.png)
![Nginx](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/nginx.png)
![Solution example](https://raw.githubusercontent.com/mdundek/psh-server/master/resources/images/solution_example.png)

# Install on Ubuntu

```
sudo curl https://raw.githubusercontent.com/mdundek/psh-server/master/install.sh | sudo bash
```

# SSL Certificate

## Generate certificate

First, generate your wildcard certificate using certbot. Follow the instructions on this blog:
https://medium.com/@saurabh6790/generate-wildcard-ssl-certificate-using-lets-encrypt-certbot-273e432794d7

Once done, make sure your certificate files are listed under `/etc/letsencrypt/live/<your domain>/`.

## Test renewal

```
/usr/local/bin/certbot renew
```

## Schedule renewal attempt of certificate in chron:

Open chron file with `crontab -e`, and add the following line at the end:

```
14 5 * * * /usr/local/bin/certbot renew --quiet --post-hook "docker container exec psh_nginx nginx -s reload" > /dev/null 2>&1
```
