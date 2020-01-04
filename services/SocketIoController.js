"use strict"

const Nginx = require("./nginx/nginx");
const DockerCompose = require("./docker/compose");

const SolutionService = require("./solution/solution");

/**
 * SocketPubSub
 */
class SocketPubSub {
    /**
     * init
     * @param {*} server 
     */
    static init(server) {
        // Start SocketIO
        this.io = require('socket.io')(server, { path: '/psh-socket' });

        //With sessions.sockets.io, you'll get session info
        this.io.on('connection', (socket) => {

            // CONTROL MODULE => RTM : CM asks to register as open for socket business
            socket.on('registerSockerUser', this.registerSockerUser.bind(this, socket));
            socket.on('deployConfig', this.deployConfig.bind(this, socket));
            socket.on('importSolution', this.importSolution.bind(this, socket));

            socket.on('getContainerStatus', this.getContainerStatus.bind(this, socket));

            // ALL => DISCONNECT
            socket.on('disconnect', this.disconnect.bind(this, socket));
        });

        // this.containerScannerInterval = setInterval(() => {
        //     this.getContainerStatus();
        // }, 60000);
        // this.getContainerStatus();
    }

    /**
     * registerSockerUser
     * @param {*} socket 
     * @param {*} data 
     */
    static registerSockerUser(socket, data) {
        // Track socket
        this.cmSocketConnections.push({
            "socketId": socket.id,
            "uid": data.uid,
            "socket": socket
        });
    }

    /**
     * deployConfig
     * @param {*} socket 
     * @param {*} data 
     */
    static deployConfig(socket, data) {
        (async () => {
            try {
                let isValide = await Nginx.prevalidateConfig();
                if (!isValide) {
                    return this.broadcastToClients('deployStatus', data.uid, { status: 'error', message: "One or more Nginx configurations are configured to use a subdomain, but have no domain configured." });
                }

                this.broadcastToClients('deployStatus', data.uid, { message: "Stopping containers..." });
                await DockerCompose.down();
                // await DockerCompose.generateYaml(function (_data, msg) {
                //     this.broadcastToClients('deployStatus', _data.uid, { message: msg });
                // }.bind(this, data));
                await Nginx.generateConfig(function (_data, msg) {
                    this.broadcastToClients('deployStatus', _data.uid, { message: msg });
                }.bind(this, data));
                await DockerCompose.populateDockerComposeEnv(function (_data, msg) {
                    this.broadcastToClients('deployStatus', _data.uid, { message: msg });
                }.bind(this, data));
                this.broadcastToClients('deployStatus', data.uid, { message: "Starting containers..." });
                await DockerCompose.up();
                this.broadcastToClients('deployStatus', data.uid, { message: "Finalizing..." });
            
                setTimeout(function (_data) {
                    DockerCompose.ps().then((cStates) => {
                        this.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
                    }).catch((err) => {
                        console.log("Could not get container status");
                    });
                    this.broadcastToClients('deployStatus', _data.uid, { status: 'done' });
                }.bind(this, data), 5000);
            } catch (err) {
                console.log("DEPLOY ERROR =>", err);
                try {
                    await DockerCompose.down();
                    await Nginx.restoreConfig();
                    await DockerCompose.restoreYaml();
                    await DockerCompose.up();
                    let cStates = await DockerCompose.ps();
                    this.broadcastToClients('deployStatus', data.uid, { status: 'error', message: err ? err.message : "Unknown" });
                    this.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
                } catch (_err) {
                    console.log("RESTORE ERROR =>", _err);
                    this.broadcastToClients('deployStatus', data.uid, { status: 'error', message: err ? err.message : "Unknown" });
                    let cStates = await DockerCompose.ps();
                    this.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
                }
            }
        })();
    }

    /**
     * importSolution
     * @param {*} socket 
     * @param {*} data 
     */
    static importSolution(socket, data) {
        (async () => {
            try {
                let subdomainsFound = await SolutionService.import(data, function (_data, msg) {
                    this.broadcastToClients('importStatus', _data.uid, { status: 'message', message: msg });
                }.bind(this, data));
                this.broadcastToClients('importStatus', data.uid, { status: 'done', hasSubdomains: subdomainsFound });
            } catch (err) {
                this.broadcastToClients('importStatus', data.uid, { status: 'error' });
            }
        })();
    }

    /**
     * getContainerStatus
     * @param {*} socket 
     * @param {*} data 
     */
    static getContainerStatus(socket, data) {
        (async () => {
            try {
                let containerStatus = await DockerCompose.ps();
                this.broadcastToClients('containerStatus', data.uid, { status: 'done', containerStatus: containerStatus });
            } catch (err) {
                this.broadcastToClients('containerStatus', data.uid, { status: 'error' });
            }
        })();
    }

    /**
     * broadcastToClients
     * @param {*} topic 
     * @param {*} uid 
     * @param {*} data 
     */
    static broadcastToClients(topic, uid, data) {
        this.cmSocketConnections.forEach(o => {
            if (o.uid == uid) {
                o.socket.emit(topic, data);
            }
        });
    }

    /**
     * disconnect
     */
    static disconnect(socket) {
        this.cmSocketConnections = this.cmSocketConnections.filter(o => o.socketId != socket.id);
        socket = null;
    }
}
SocketPubSub.io = null
SocketPubSub.cmSocketConnections = [];

SocketPubSub.containerScannerInterval = null;

module.exports = SocketPubSub;