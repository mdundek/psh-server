const { spawn } = require('child_process');
const YAML = require('yaml');
const fs = require('fs');
const moment = require('moment');
const LoopbackTools = require("../../common/loopback-model-tools");
const path = require("path");
const Env = require("../../lib/env");
const axios = require('axios');
const rimraf = require("rimraf");

class ComposeService {

    /**
     * init
     */
    static init(models) {
        this.models = models;
    }

    /**
     * generateYaml
     */
    static async generateYaml(broadcastMsg) {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }

        let yamlFileContent = fs.readFileSync(`${global.__basedir}/resources/docker-compose/docker-compose.yml`, 'utf8');
        let yamlDoc = YAML.parse(yamlFileContent);

        let containers = await LoopbackTools.asyncCall(this.models.Container, "find", {
            "where": {
                "enabled": true
            },
            "include": ["networks", "dockerImage"]
        });

        // Look for host folders that need git cloning
        for (let i = 0; i < containers.length; i++) {
            if (containers[i].volumes.length > 0) {
                for (let y = 0; y < containers[i].volumes.length; y++) {
                    if (containers[i].volumes[y].git.length > 0) {

                        if (!fs.existsSync(containers[i].volumes[y].hostPath)) {
                            fs.mkdirSync(containers[i].volumes[y].hostPath, { recursive: true });
                        }
                        let cloned = false;
                        if (!fs.existsSync(path.join(containers[i].volumes[y].hostPath, ".git"))) {
                            broadcastMsg("Cloning GIT...");
                            cloned = true;
                            try {
                                await this._spawn('git', ['clone', containers[i].volumes[y].git, "."], containers[i].volumes[y].hostPath);
                            } catch (err) {
                                console.log(err);
                                throw new Error("Could not clone repo: " + containers[i].volumes[y].git);
                            }
                        } else if (containers[i].volumes[y].execOnEveryDeploy) {
                            broadcastMsg("Pulling GIT...");
                            try {
                                await this._spawn('git', ['pull'], containers[i].volumes[y].hostPath);
                            } catch (err) {
                                console.log(err);
                                throw new Error("Could not pull repo: " + containers[i].volumes[y].git);
                            }
                        }

                        if ((cloned || containers[i].volumes[y].execOnEveryDeploy) && containers[i].volumes[y].cmd.length > 0) {
                            try {
                                broadcastMsg(`Executing command:  ${containers[i].volumes[y].cmd}...`);

                                let cmdArray = containers[i].volumes[y].cmd.split(" ");
                                let command = cmdArray.splice(0, 1)[0];
                                await this._spawn(command, cmdArray, containers[i].volumes[y].hostPath);
                            } catch (err) {
                                console.log(err);
                                throw new Error("There was a problem! could not execute command " + containers[i].volumes[y].cmd);
                            }
                        }
                    }
                }
            }
        }

        broadcastMsg("Deploying...");
        let networks = [];
        let nginxDependsOn = [];
        containers.forEach((c => {
            c = c.toJSON();

            nginxDependsOn.push(c.name);
            yamlDoc.services[c.name] = {
                "image": c.dockerImage.name + (c.dockerImage.version.length > 0 ? ":" + c.dockerImage.version : ""),
                "restart": "always"
            };

            yamlDoc.services[c.name].container_name = "psh_" + c.name;

            if (c.ports.length > 0) {
                yamlDoc.services[c.name].ports = c.ports;
            }

            if (c.env.length > 0) {
                yamlDoc.services[c.name].environment = c.env;
            }

            if (c.dns.length > 0) {
                yamlDoc.services[c.name].dns = c.dns;
            }

            if (c.volumes.length > 0) {
                yamlDoc.services[c.name].volumes = c.volumes.map(v => v.hostPath + ":" + v.containerPath);
            }

            if (c.workingDir && c.workingDir.length > 0) {
                yamlDoc.services[c.name].working_dir = c.workingDir;
            }

            if (c.user && c.user.length > 0) {
                yamlDoc.services[c.name].user = c.user;
            }

            if (c.command && c.command.length > 0) {
                yamlDoc.services[c.name].command = c.command;
            }

            if (c.dependsOn.length > 0) {
                yamlDoc.services[c.name].depends_on = c.dependsOn.map(cdoi => containers.find(_c => _c.id == cdoi).name);
            }

            c.networks.forEach((n) => {
                if (!networks.find(u => u.name == n.name)) {
                    networks.push(n);
                }
            });
            yamlDoc.services[c.name].networks = ["nginx_network", ...networks];

            if (c.dockerImage.template && c.dockerImage.template.length > 0) {
                let yamlDocTemplate = YAML.parse(c.dockerImage.template);
                Object.keys(yamlDocTemplate).forEach(tKey => {
                    if (!yamlDoc.services[c.name][tKey]) {
                        yamlDoc.services[c.name][tKey] = yamlDocTemplate[tKey];
                    }
                });
            }
        }));
        if (nginxDependsOn.length > 0) {
            yamlDoc.services.nginx.depends_on = nginxDependsOn;
        }
        networks.forEach(n => {
            yamlDoc.networks[n.name] = { "driver": "bridge" }
        });

        await this._spawn('mkdir', ['-p', path.dirname(composeFilePath.value)]);

        // Delete previous config file
        if (fs.existsSync(composeFilePath.value)) {
            let backupPath = composeFilePath.value + ".backup";
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }
            fs.renameSync(composeFilePath.value, composeFilePath.value + ".backup");
        }
        // Save content to config file
        fs.writeFileSync(composeFilePath.value, YAML.stringify(yamlDoc));
    }

    /**
     * restoreConfig
     */
    static async restoreYaml() {
        let dcomposeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!dcomposeFilePath || !dcomposeFilePath.value || dcomposeFilePath.value.length == 0) {
            return;
        }

        let dcomposeTargetFile = dcomposeFilePath.value;
        let backupPath = dcomposeTargetFile + ".backup";
        if (fs.existsSync(backupPath)) {
            if (fs.existsSync(dcomposeTargetFile)) {
                console.log("");
                console.log("Failed YAML config -----------------------------");
                console.log("");
                console.log(fs.readFileSync(dcomposeTargetFile).toString());
                console.log("------------------------------------------------");
                fs.unlinkSync(dcomposeTargetFile);
            }
            fs.renameSync(backupPath, dcomposeTargetFile);
        }
    }

    /**
     * ps
     */
    static async ps() {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }
        
        console.log("=> docker-compose ps...");
        // if (Env.get("RUNTIME_ENV") == "prod") {
            try {
                let output = await this._spawnData('docker-compose', ['ps'], path.dirname(composeFilePath.value));
                this.status = output.split("\n").filter((o, i) => {
                    return i > 1 && o.length > 0;
                })
                .map(    o => o.split("  ").map(a => a.trim()).filter(b => b.length > 0)    )
                
                console.log(this.status);


                this.status = this.status.map(o => { return {
                    "name": o[0],
                    "state": o[2].toUpperCase()
                }});  





                
                return this.status;       
            } catch (err) {
                console.log("ERROR =>", err);
                this.status = [];
                throw err;
            }
        // } else {
        //     console.log("=> DEV mode, docker-compose ps stubbed");
        // }
    }










    /**
     * stop
     */
    static async stop(cId) {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }
        
        console.log("=> docker-compose stop...");
        // if (Env.get("RUNTIME_ENV") == "prod") {
            try {
                let container = await LoopbackTools.asyncCall(this.models.Container, "findOne", {
                    "where": {
                        "id": cId
                    }
                });
                await this._spawn('docker-compose', ['stop', container.name], path.dirname(composeFilePath.value));

                // let cStates = await this.ps();
                
            } catch (err) {
                console.log("ERROR =>", err);
                this.status = [];

                // let cStates = await this.ps();
                // SocketPubSub.broadcastToClients("containerStatus", uId, { status: 'done', containerStatus: cStates });

                throw err;
            }
        // } else {
        //     console.log("=> DEV mode, docker-compose ps stubbed");
        // }
    }










    /**
     * start
     */
    static async start(cId) {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }
        
        console.log("=> docker-compose start...");
        // if (Env.get("RUNTIME_ENV") == "prod") {
            try {
                let container = await LoopbackTools.asyncCall(this.models.Container, "findOne", {
                    "where": {
                        "id": cId
                    }
                });
                await this._spawn('docker-compose', ['start', container.name], path.dirname(composeFilePath.value));

                // let cStates = await this.ps();
                // SocketPubSub.broadcastToClients("containerStatus", uId, { status: 'done', containerStatus: cStates });
            } catch (err) {
                console.log("ERROR =>", err);
                this.status = [];

                // let cStates = await this.ps();
                // SocketPubSub.broadcastToClients("containerStatus", uId, { status: 'done', containerStatus: cStates });

                throw err;
            }
        // } else {
        //     console.log("=> DEV mode, docker-compose ps stubbed");
        // }
    }










    /**
     * restart
     */
    static async restart(cId) {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }
        
        console.log("=> docker-compose restart...");
        // if (Env.get("RUNTIME_ENV") == "prod") {
            try {
                let container = await LoopbackTools.asyncCall(this.models.Container, "findOne", {
                    "where": {
                        "id": cId
                    }
                });
                await this._spawn('docker-compose', ['restart', container.name], path.dirname(composeFilePath.value));

                // let cStates = await this.ps();
                // SocketPubSub.broadcastToClients("containerStatus", uId, { status: 'done', containerStatus: cStates });
            } catch (err) {
                console.log("ERROR =>", err);
                this.status = [];

                // let cStates = await this.ps();
                // SocketPubSub.broadcastToClients("containerStatus", uId, { status: 'done', containerStatus: cStates });

                throw err;
            }
        // } else {
        //     console.log("=> DEV mode, docker-compose ps stubbed");
        // }
    }







    /**
     * down
     */
    static async down() {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }
        console.log("=> docker-compose down...");
        if (Env.get("RUNTIME_ENV") == "prod") {
            try {
                await this._spawn('docker-compose', ['down'], path.dirname(composeFilePath.value));
            } catch (err) {
                console.log("ERROR =>", err);
            }
            // await this.ps();
        } else {
            console.log("=> DEV mode, docker-compose down stubbed");
        }
    }

    /**
     * up
     */
    static up() {
        return new Promise((resolve, reject) => {
            (async () => {
                let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
                    "where": {
                        "name": "composeConfigPath"
                    }
                });
                if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
                    reject(new Error("Settings not defined: composeConfigPath"));
                }
                console.log("=> docker-compose up...");
                if (Env.get("RUNTIME_ENV") == "prod") {
                    try {
                        await this._spawn('docker-compose', ['up', '-d'], path.dirname(composeFilePath.value));
                    } catch (err) {
                        return reject(err);
                    }
                    // Get Ping url
                    let nginxDefaultDomainSetting = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
                        "where": {
                            "name": "defaultNginxDomain"
                        }
                    });
                    if (!nginxDefaultDomainSetting || !nginxDefaultDomainSetting.value || nginxDefaultDomainSetting.value.length == 0) {
                        reject(new Error("Settings not defined: defaultNginxDomain"));
                    }
                    let nginxDefaultDomain = await LoopbackTools.asyncCall(this.models.Domain, "findOne", {
                        "where": {
                            "value": nginxDefaultDomainSetting.value
                        }
                    });
                    if (!nginxDefaultDomain) {
                        reject(new Error("Domain not found: " + nginxDefaultDomainSetting.value));
                    }
                    let pingUrl = `${nginxDefaultDomain.httpsEnabled ? "https" : "http"}://${nginxDefaultDomainSetting.value}/psh-ping`;

                    // Listen for server restart success
                    let scanStart = moment();
                    let successCounts = 0;

                    // Prepare Axios instance
                    var instance = axios.create();
                    instance.defaults.timeout = 2000;

                    // Set up interval to probe server
                    let interval = setInterval(() => {
                        (async() => {
                            try{
                                let response = await instance.get(pingUrl);
                                successCounts++;
                                if (successCounts >= 5) {
                                    clearInterval(interval);
                                    // await this.ps();
                                    resolve();
                                }
                            } catch (error) {
                                successCounts = 0;
                                if (moment().subtract(60, "seconds").isAfter(scanStart)) {
                                    clearInterval(interval);
                                    // await this.ps();
                                    // resolve();
                                    reject(new Error("Could not start server, please check your configuration"));
                                }
                            }
                        })();
                    }, 2000);
                } else {
                    console.log("=> DEV mode, docker-compose up stubbed");
                    resolve();
                }
            })();
        });
    }

    /**
     * populateDockerComposeEnv
     */
    static async populateDockerComposeEnv(broadcastMsg) {
        let composeFilePath = await LoopbackTools.asyncCall(this.models.Settings, "findOne", {
            "where": {
                "name": "composeConfigPath"
            }
        });
        if (!composeFilePath || !composeFilePath.value || composeFilePath.value.length == 0) {
            throw new Error("Settings not defined: composeConfigPath");
        }
        console.log("=> Populating docker compose .env file...");
        await this._spawn('mkdir', ['-p', path.dirname(composeFilePath.value)]);
        await this._spawn('./populateDockerHostIp.sh', [path.dirname(composeFilePath.value)], `${global.__basedir}/resources/`);
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

            // child.stdout.on('data', (data) => {
            //     console.log(`${data}`);
            // });

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

    /**
     * _spawnData
     */
    static _spawnData(cmd, params, workingDirectory) {
        return new Promise((resolve, reject) => {
            let outData = "";
            const child = spawn(
                cmd,
                params ? params : [],
                workingDirectory ? {
                    cwd: workingDirectory
                } : {}
            );

            child.stdout.on('data', (data) => {
                outData += data;
            });

            child.stderr.on('data', (data) => {
                console.log(`${data}`);
            });

            child.on('close', (code) => {
                if (code == 0) {
                    resolve(outData);
                } else {
                    reject();
                }
            });
        });
    }

    /**
     * removeDir
     * @param {*} path 
     */
    static removeDir(path) {
        return new Promise((resolve, reject) => {
            rimraf(path, function () {
                resolve();
            });
        });
    }
}

ComposeService.models = null;
ComposeService.status = [];
module.exports = ComposeService;