'use strict';

const Nginx = require("../../services/nginx/nginx");
const DockerCompose = require("../../services/docker/compose");

module.exports = function (Nginxconfig) {
    // /**
    //      * REMOTE METHOD: deployConfig
    //      */
    // Nginxconfig.deployConfig = function (cb) {
    //     (async () => {
    //         try {
    //             await DockerCompose.down();
    //             await DockerCompose.generateYaml();
    //             await Nginx.generateConfig();
    //             await DockerCompose.populateDockerComposeEnv();
    //             await DockerCompose.up();

    //             setTimeout(() => {
    //                 cb();
    //             }, 5000);
    //         } catch (err) {
    //             try {
    //                 await DockerCompose.down();
    //                 await Nginx.restoreConfig();
    //                 await DockerCompose.restoreYaml();
    //                 await DockerCompose.up();
    //                 cb(err);
    //             } catch (_err) {
    //                 cb(err);
    //             }
    //             cb(err);
    //         }
    //     })();
    // }

    // /**
    //  * REMOTE METHOD DECLARATION: deployConfig
    //  */
    // Nginxconfig.remoteMethod("deployConfig", {
    //     description: "Deploy configuration",
    //     accepts: [],
    //     http: {
    //         path: "/deployConfig",
    //         verb: "GET"
    //     },
    //     returns: []
    // });
};
