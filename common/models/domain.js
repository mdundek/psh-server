'use strict';

const fs = require('fs');
const path = require("path");
const LoopbackTools = require("../loopback-model-tools");
var rimraf = require("rimraf");
const Env = require("../../lib/env");
var app = require('../../server/server');

let LETSENCRYPT_SSL_DIR = Env.get("RUNTIME_ENV") == "prod" ? "/usr/local/private-server-hub/.letsencrypt" : "";

/**
 * asyncForEach
 * @param {*} array 
 * @param {*} callback 
 */
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

/**
 * removeDir
 * @param {*} path 
 */
let removeDir = (path) => {
    return new Promise((resolve, reject) => {
        rimraf(path, function () {
            resolve();
        });
    });
}

module.exports = function (Domain) {
    /**
     * REMOTE METHOD: checkDomainSslCert
     */
    Domain.checkDomainSslCert = function (domainId, cb) {
        (async () => {
            let domain = await LoopbackTools.asyncCall(Domain, "findOne", {
                "where": {
                    "id": domainId
                }
            });
            if (!domain) {
                return cb(new Error("Unknown domain ID ", domainId));
            }

            // If in developement environement, we adapt the ssl base folder
            if (Env.get("RUNTIME_ENV") != "prod") {
                let nginxHtpasswdDir = await LoopbackTools.asyncCall(app.models.Settings, "findOne", {
                    "where": {
                        "name": "nginxHtpasswdDir"
                    }
                });
                if (!nginxHtpasswdDir) {
                    return cb(new Error("Missing NGinx ssl dir setting"));
                }
                let pathString = nginxHtpasswdDir.value;
                let nginxBasePathArray = nginxHtpasswdDir.value.split(path.sep);
                if (pathString.lastIndexOf(path.sep) == pathString.length - 1) {
                    nginxBasePathArray.pop();
                }
                nginxBasePathArray.pop();

                let tmpSslPath = path.join(nginxBasePathArray.join(path.sep), "ssl");
                let tmpSslLivePath = path.join(tmpSslPath, "live");
                if (!fs.existsSync(tmpSslLivePath)) {
                    fs.mkdirSync(tmpSslLivePath, { recursive: true });
                }
                LETSENCRYPT_SSL_DIR = tmpSslPath;
            }

            let keyFileName = path.join(LETSENCRYPT_SSL_DIR, "live", domain.value, "privkey");
            let certFileName = path.join(LETSENCRYPT_SSL_DIR, "live", domain.value, "cert");
            if ((fs.existsSync(keyFileName + ".pem") || fs.existsSync(keyFileName + ".crt")) && (fs.existsSync(certFileName + ".pem") || fs.existsSync(certFileName + ".crt"))) {
                cb(null, {
                    "configured": true
                });
            } else {
                cb(null, {
                    "configured": false
                });
            }
        })();
    }

    /**
     * REMOTE METHOD DECLARATION: checkDomainSslCert
     */
    Domain.remoteMethod("checkDomainSslCert", {
        description: "Check if domain ssl certificate exists",
        accepts: [
            { arg: 'domainId', type: 'string' }
        ],
        http: {
            path: "/checkDomainSslCert",
            verb: "GET"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });

    /**
     * uploadCertificate
     */
    Domain.uploadCertificate = function (domainId, req, res, options, cb) {
        (async () => {
            try {
                let domain = await LoopbackTools.asyncCall(Domain, "findOne", {
                    "where": {
                        "id": domainId
                    }
                });

                if (!domain) {
                    return cb(new Error("Unknown domain ID ", domainId));
                }

                // If in developement environement, we adapt the ssl base folder
                if (Env.get("RUNTIME_ENV") != "prod") {
                    let nginxHtpasswdDir = await LoopbackTools.asyncCall(app.models.Settings, "findOne", {
                        "where": {
                            "name": "nginxHtpasswdDir"
                        }
                    });
                    if (!nginxHtpasswdDir) {
                        return cb(new Error("Missing NGinx ssl dir setting"));
                    }
                    let pathString = nginxHtpasswdDir.value;
                    let nginxBasePathArray = nginxHtpasswdDir.value.split(path.sep);
                    if (pathString.lastIndexOf(path.sep) == pathString.length - 1) {
                        nginxBasePathArray.pop();
                    }
                    nginxBasePathArray.pop();

                    let tmpSslPath = path.join(nginxBasePathArray.join(path.sep), "ssl");
                    let tmpSslLivePath = path.join(tmpSslPath, "live", domain.value);
                    if (!fs.existsSync(tmpSslLivePath)) {
                        fs.mkdirSync(tmpSslLivePath, { recursive: true });
                    }
                    LETSENCRYPT_SSL_DIR = tmpSslPath;
                }

                // Reset certificate folder
                let domainCertDir = path.join(LETSENCRYPT_SSL_DIR, "live", domain.value);
                if (fs.existsSync(domainCertDir)) {
                    await removeDir(domainCertDir);
                    fs.mkdirSync(domainCertDir);
                }

                // write certificate files
                await asyncForEach(req.files, async (file) => {
                    let filePath = path.join(domainCertDir, file.fieldname + "." + file.originalname.substring(file.originalname.lastIndexOf(".") + 1));
                    fs.writeFileSync(filePath, file.buffer);
                });

                // Done
                cb(null, {
                    success: true
                });

            } catch (err) {
                console.log(err);
                cb(null, {
                    success: false,
                    error: err.message
                });
            }
        })();
    };

    Domain.remoteMethod("uploadCertificate", {
        description: "Import solution",
        accepts: [
            { arg: 'domainId', type: 'string', required: true },
            { arg: "req", type: "object", "http": { source: "req" } },
            { arg: "res", type: "object", "http": { source: "res" } },
            { arg: "options", type: "object", description: "options", http: "optionsFromRequest" }
        ],
        http: {
            path: "/uploadCertificate/:domainId",
            verb: "POST"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });

};
