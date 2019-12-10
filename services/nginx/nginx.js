const NginxConfFile = require('nginx-conf').NginxConfFile;
const { spawn } = require('child_process');
const fs = require("fs");
const path = require("path");
const LoopbackTools = require("../../common/loopback-model-tools");

class NginxService {

    /**
     * init
     */
    static init(models) {
        this.models = models;
    }

    /**
     * generateBasicAuth
     */
    /*static async generateBasicAuth() {
        let nginxAuthFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "nginxHtpasswdDir"
            }
        });
        if (!nginxAuthFilePath || !nginxAuthFilePath.value || nginxAuthFilePath.value.length == 0) {
            return new Error("nginxHtpasswdDir setting not defined");
        }

        if (!fs.existsSync(nginxAuthFilePath.value)) {
            return new Error("Could not find the nginx password file");
        }

        let basicAuthUsers = await LoopbackTools.asyncCall(this.models.BasicAuth, "find", {});

        // Get all user names in file
        // Compare against DB basicAuth users, create and delete as necessary
    }*/

    /**
     * prevalidateConfig
     */
    static async prevalidateConfig() {
        let nginxConfigs = await LoopbackTools.asyncCall(this.models.NginxConfig, "find");
        return nginxConfigs.find(o => o.asSubdomain && !o.domainId) == null;
    }

    /**
     * generateConfig
     */
    static async generateConfig(broadcastMsg) {
        let nginxConfigs = await LoopbackTools.asyncCall(this.models.NginxConfig, "find", {
            "include": ["nginxDockerLinks", "domain", "basicAuth", "nginxPresetParams"]
        });

        // Get containers
        for (let i = 0; i < nginxConfigs.length; i++) {
            nginxConfigs[i] = nginxConfigs[i].toJSON();

            nginxConfigs[i].containers = [];
            for (let y = 0; y < nginxConfigs[i].nginxDockerLinks.length; y++) {
                let container = await LoopbackTools.asyncCall(this.models.Container, "findOne", {
                    "where": {
                        "id": nginxConfigs[i].nginxDockerLinks[y].containerId
                    }
                });
                nginxConfigs[i].containers.push(container.toJSON());
            }
        }

        let config = await this.prepareConfigFile();

        // Default domain first
        let defaultDomainSetting = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "defaultNginxDomain"
            }
        });
        if (defaultDomainSetting) {
            config.nginx.server._add('server_name', defaultDomainSetting.value);
            let defaultDomain = await LoopbackTools.asyncCall(this.models.Domain, "findOne", {
                "where": {
                    "value": defaultDomainSetting.value
                }
            });

            if (defaultDomain && defaultDomain.httpsEnabled) {
                config.nginx.server._add('listen', '443 ssl');
                config.nginx.server._add('ssl_certificate', `/etc/letsencrypt/live/${defaultDomain.value}/fullchain.pem`);
                config.nginx.server._add('ssl_certificate_key', `/etc/letsencrypt/live/${defaultDomain.value}/privkey.pem`);
                config.nginx.server._add('include', `/etc/letsencrypt/options-ssl-nginx.conf`);
                config.nginx.server._add('ssl_dhparam', `/etc/letsencrypt/ssl-dhparams.pem`);

                // Add http redirect
                config.nginx._add('server');
                let targetServerRedirectConfig = config.nginx.server[config.nginx.server.length - 1];
                targetServerRedirectConfig._addVerbatimBlock('if ($host = ' + defaultDomainSetting.value + ')', '\n        return 301 https://$host$request_uri;\n    ');
                targetServerRedirectConfig._add('server_name', defaultDomainSetting.value);
                targetServerRedirectConfig._add('listen', '80');
                targetServerRedirectConfig._add('return', '404');
            } else {
                config.nginx.server._add('listen', "80");
            }
        }

        // Now create each config data
        for (let i = 0; i < nginxConfigs.length; i++) {
            let targetServerConfig = await this._getOrCreateServer(nginxConfigs, config, nginxConfigs[i]);
            await this._createServerLocation(nginxConfigs[i], targetServerConfig, config);
        }
    }

    /**
     * restoreConfig
     */
    static async restoreConfig() {
        let nginxFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "nginxConfigPath"
            }
        });
        if (!nginxFilePath || !nginxFilePath.value || nginxFilePath.value.length == 0) {
            return;
        }

        let nginxtargetFile = nginxFilePath.value;
        let backupPath = nginxtargetFile + ".backup";
        if (fs.existsSync(backupPath)) {
            if (fs.existsSync(nginxtargetFile)) {
                console.log("");
                console.log("Failed NGINX config -----------------------------");
                console.log("");
                console.log(fs.readFileSync(nginxtargetFile).toString());
                console.log("-------------------------------------------------");
                fs.unlinkSync(nginxtargetFile);
            }
            fs.renameSync(backupPath, nginxtargetFile);
        }
    }

    /**
     * addHtpasswd
     * @param {*} nginxAuthFilePath 
     * @param {*} user 
     * @param {*} password 
     */
    static async addHtpasswd(nginxAuthFilePath, user, password) {
        let htpasswdFile = path.join(nginxAuthFilePath.value, user + '_htpasswd');

        if (fs.existsSync(htpasswdFile)) {
            let existingLine = fs.readFileSync(htpasswdFile).toString().split("\n").find(l => l.toLowerCase().indexOf(user.toLowerCase()) == 0);
            if (existingLine) {
                await this._spawn('htpasswd', ['-D', htpasswdFile, user]);
            }
            await this._spawn('htpasswd', ['-b', htpasswdFile, user, password]);
        } else {
            await this._spawn('htpasswd', ['-c', '-b', htpasswdFile, user, password]);
        }
    }

    /**
     * _getOrCreateServer
     * @param {*} nginxConfigs 
     * @param {*} config 
     * @param {*} c 
     */
    static async _getOrCreateServer(nginxConfigs, config, ngxc) {
        // Now continue
        let target_server_name = this._generateServerName(ngxc);
        let targetServerConfig = null;
        if (target_server_name) { // Only if a domain is configured
            targetServerConfig = this._findServerByHostName(config, target_server_name);
            // If the server block already exists for this domain
            if (!targetServerConfig) {
                config.nginx._add('server');

                targetServerConfig = config.nginx.server[config.nginx.server.length - 1];
                targetServerConfig._add('server_name', target_server_name);
                targetServerConfig._add('client_max_body_size', '0');
                targetServerConfig._add('chunked_transfer_encoding', 'on');
                targetServerConfig._add('access_log', 'off');

                // See if any of this domains has HTTPS enabled
                if (ngxc.domain.httpsEnabled) {
                    targetServerConfig._add('listen', '443 ssl');
                    targetServerConfig._add('ssl_certificate', `/etc/letsencrypt/live/${ngxc.domain.value}/fullchain.pem`);
                    targetServerConfig._add('ssl_certificate_key', `/etc/letsencrypt/live/${ngxc.domain.value}/privkey.pem`);
                    targetServerConfig._add('include', `/etc/letsencrypt/options-ssl-nginx.conf`);
                    targetServerConfig._add('ssl_dhparam', `/etc/letsencrypt/ssl-dhparams.pem`);

                    // Add http redirect
                    config.nginx._add('server');
                    let targetServerRedirectConfig = config.nginx.server[config.nginx.server.length - 1];
                    targetServerRedirectConfig._addVerbatimBlock('if ($host = ' + target_server_name + ')', '\n        return 301 https://$host$request_uri;\n    ');
                    targetServerRedirectConfig._add('server_name', target_server_name);
                    targetServerRedirectConfig._add('listen', '80');
                    targetServerRedirectConfig._add('return', '404');
                } else {
                    targetServerConfig._add('listen', "80");
                }
            }
        }
        // Else we add it to the root server name
        else {
            targetServerConfig = config.nginx.server.length ? config.nginx.server[0] : config.nginx.server;
        }
        return targetServerConfig;
    }

    /**
     * _findServerByHostName
     * @param {*} config 
     * @param {*} container 
     */
    static _findServerByHostName(config, hostName) {
        if (config.nginx.server.length) {
            for (let i = 0; i < config.nginx.server.length; i++) {
                if (config.nginx.server[i].server_name && config.nginx.server[i].server_name._value == hostName) {
                    return config.nginx.server[i];
                }
            }
        } else {
            if (config.nginx.server.server_name && config.nginx.server.server_name._value == hostName) {
                return config.nginx.server;
            }
        }
        return null;
    }

    /**
     * _generateServerName
     * @param {*} container 
     */
    static _generateServerName(container) {
        if (!container.domain) {
            return null;
        }
        if (!container.asSubdomain) {
            return container.domain.value;
        } else {
            return container.subdomain + "." + container.domain.value;
        }
    }


    /**
     * _createServerLocation
     * @param {*} c 
     * @param {*} serverObj 
     */
    static async _createServerLocation(ngxc, serverObj, configRoot) {
        if (ngxc.uriPath.length > 0 && ngxc.uriPath != "/") {
            serverObj._add('location', (ngxc.uriPath.indexOf('/') == 0 ? '' : '/') + ngxc.uriPath);
        } else {
            serverObj._add('location', '/');
        }
        let targetLocation = serverObj.location.length ? serverObj.location[serverObj.location.length - 1] : serverObj.location;

        if (ngxc.serverTarget == 'c' || ngxc.serverTarget == 'h') {
            targetLocation._add('proxy_pass', `http://${ngxc.name}`);
        } else {
            targetLocation._add('proxy_pass', `${ngxc.proxyPath}`);
        }
        if (ngxc.basicAuth) {
            let nginxAuthFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
                "where": {
                    "name": "nginxHtpasswdDir"
                }
            });
            if (!nginxAuthFilePath || !nginxAuthFilePath.value || nginxAuthFilePath.value.length == 0) {
                throw new Error("nginxHtpasswdDir setting not defined");
            }
            if (!fs.existsSync(nginxAuthFilePath.value)) {
                throw new Error("Could not find the nginx password file");
            }

            targetLocation._add('auth_basic', `"Restricted"`);
            targetLocation._add('auth_basic_user_file', path.join("/etc/nginx/auth/", ngxc.basicAuth.username + '_htpasswd'));

            // Create password file for user
            await this.addHtpasswd(nginxAuthFilePath, ngxc.basicAuth.username, ngxc.basicAuth.password);
        }

        targetLocation._add('proxy_bind', '$server_addr');

        if (ngxc.serverTarget == 'c') {
            if (ngxc.containers.length > 0) {
                configRoot.nginx._add('upstream', ngxc.name);
                ngxc.containers.forEach(container => {
                    configRoot.nginx.upstream[configRoot.nginx.upstream.length - 1]._add('server', `${container.name}:${ngxc.port}`);
                });
            }
        } else if (ngxc.serverTarget == 'h') {
            configRoot.nginx._add('upstream', ngxc.name);
            configRoot.nginx.upstream[configRoot.nginx.upstream.length - 1]._add('server', `dockerhost:${ngxc.port}`);
        }

        if (ngxc.nginxPresetParams) {
            ngxc.nginxPresetParams.list.forEach(p => {
                let pArray = p.split(' ');
                targetLocation._add(pArray[0], pArray.slice(1).join(' '));
            });
        }
    }

    /**
     * prepareConfigFile
     */
    static prepareConfigFile() {
        return new Promise((resolve, reject) => {
            (async () => {
                let nginxFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
                    "where": {
                        "name": "nginxConfigPath"
                    }
                });
                if (!nginxFilePath || !nginxFilePath.value || nginxFilePath.value.length == 0) {
                    return reject(new Error("Settings not defined: nginxConfigPath"));
                }

                let nginxConfigFileContent = `${global.__basedir}/resources/nginx/default.conf`;
                let nginxtargetFile = nginxFilePath.value;


                await this._spawn('mkdir', ['-p', path.dirname(nginxtargetFile)]);

                if (fs.existsSync(nginxtargetFile)) {
                    let backupPath = nginxtargetFile + ".backup";
                    if (fs.existsSync(backupPath)) {
                        fs.unlinkSync(backupPath);
                    }
                    fs.renameSync(nginxtargetFile, backupPath);
                }

                fs.copyFileSync(nginxConfigFileContent, nginxtargetFile);

                NginxConfFile.create(nginxtargetFile, function (err, conf) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(conf);
                });
            })();
        });
    }

    /**
     * _spawn
     */
    static _spawn(cmd, params, workingDirectory) {
        return new Promise((resolve, reject) => {
            const child = spawn(
                cmd,
                params ? params : [],
                workingDirectory ? {
                    cwd: workingDirectory
                } : {}
            );

            child.stdout.on('data', (data) => {
                console.log(`${data}`);
            });

            child.stderr.on('data', (data) => {
                console.log(`${data}`);
            });

            child.on('close', (code) => {
                if (code == 0) {
                    resolve();
                } else {
                    reject();
                }
            });
        });
    }
}

NginxService.models = null;
module.exports = NginxService;