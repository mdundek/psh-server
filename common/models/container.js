'use strict';

const LoopbackTools = require("../loopback-model-tools");
const DockerCompose = require("../../services/docker/compose");
const SocketPubSub = require("../../services/SocketIoController");

module.exports = function (Container) {
    /**
     * toggleEnabled
     */
    Container.toggleEnabled = function (data, cb) {
        (async () => {
            try {
                // Make sure the solution name is not already present in this setup
                let container = await LoopbackTools.asyncCall(Container, "findOne", {
                    "where": {
                        "id": data.id
                    }
                });

                if(!container){
                    return cb(null, {
                        success: false,
                        error: "Unknown container ID"
                    });
                }

                container.enabled = data.enabled;
                container.save((err, dbInstance) => {
                    if (err) {
                        return cb(null, {
                            success: false,
                            error: err.message
                        });
                    }
                    // Done
                    cb(null, {
                        success: true
                    });
                });
            } catch (err) {
                console.log(err);
                cb(null, {
                    success: false,
                    error: err ? err.message : "Could not start container"
                });
            }
        })();
    };

    Container.remoteMethod("toggleEnabled", {
        description: "Toggle container enabled state",
        accepts: [
            { arg: 'data', type: 'object', http: { source: 'body' } }
        ],
        http: {
            path: "/toggleEnabled",
            verb: "POST"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });

    /**
     * stop
     */
    Container.stop = function (data, cb) {
        (async () => {
            try {
                await DockerCompose.stop(data.id);
                // Done
                cb(null, {
                    success: true
                });
                let cStates = await DockerCompose.ps();
                SocketPubSub.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
            } catch (err) {
                console.log(err);
                cb(null, {
                    success: false,
                    error: err ? err.message : "Could not start container"
                });
                let cStates = await DockerCompose.ps();
                SocketPubSub.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
            }
        })();
    };

    Container.remoteMethod("stop", {
        description: "Stop container",
        accepts: [
            { arg: 'data', type: 'object', http: { source: 'body' } }
        ],
        http: {
            path: "/stop",
            verb: "POST"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });

    /**
     * start
     */
    Container.start = function (data, cb) {
        (async () => {
            try {
                await DockerCompose.start(data.id);
                // Done
                cb(null, {
                    success: true
                });
                let cStates = await DockerCompose.ps();
                SocketPubSub.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
            } catch (err) {
                console.log(err);
                cb(null, {
                    success: false,
                    error: err ? err.message : "Could not start container"
                });
                let cStates = await DockerCompose.ps();
                SocketPubSub.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
            }
        })();
    };

    Container.remoteMethod("start", {
        description: "Start container",
        accepts: [
            { arg: 'data', type: 'object', http: { source: 'body' } }
        ],
        http: {
            path: "/start",
            verb: "POST"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });

    /**
     * restart
     */
    Container.restart = function (data, cb) {
        (async () => {
            try {
                await DockerCompose.restart(data.id);
                // Done
                cb(null, {
                    success: true
                });
                let cStates = await DockerCompose.ps();
                SocketPubSub.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
            } catch (err) {
                console.log(err);
                cb(null, {
                    success: false,
                    error: err ? err.message : "Could not start container"
                });
                let cStates = await DockerCompose.ps();
                SocketPubSub.broadcastToClients("containerStatus", data.uid, { status: 'done', containerStatus: cStates });
            }
        })();
    };

    Container.remoteMethod("restart", {
        description: "Restart container",
        accepts: [
            { arg: 'data', type: 'object', http: { source: 'body' } }
        ],
        http: {
            path: "/restart",
            verb: "POST"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });
};
