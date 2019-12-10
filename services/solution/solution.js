const { spawn } = require('child_process');
const fs = require("fs");
const path = require("path");
var extract = require('extract-zip');
var rimraf = require("rimraf");
var archiver = require('archiver');
const LoopbackTools = require("../../common/loopback-model-tools");

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

class SolutionService {

    /**
     * init
     */
    static init(models) {
        this.models = models;
    }

    /**
     * generateConfig
     */
    static async import(data, msgCb) {
        let solutionJson = JSON.parse(fs.readFileSync(data.solutionJsonFilePath, "utf8"));

        let domainSetupNeeded = false;

        // 1.  Build docker images if any
        for (let i = 0; i < data.containerBuildDirs.length; i++) {
            let containerImage = solutionJson.solutionParameters.find(sp => sp.container.name == data.containerBuildDirs[i].name).container.dockerImage;

            // Get existing images on local machine
            let localImagesOutput = null;
            try {
                localImagesOutput = await this._spawnPromise("docker", ["images", containerImage.name + (containerImage.version ? (":" + containerImage.version) : ":latest")]);
            } catch (err) {
                return cb(null, {
                    success: false,
                    error: "It seems like there is no docker cli abailable"
                });
            }

            // If the image does not exist
            if (localImagesOutput.length <= 1) {
                try {
                    msgCb("Building image " + containerImage.name + (containerImage.version ? (":" + containerImage.version) : ":latest"));
                    await this.buildDockerFile(containerImage, data.containerBuildDirs[i].root);
                } catch (err) {
                    return cb(null, {
                        success: false,
                        error: "There was an error while building the Docker image"
                    });
                }
            }
        }

        msgCb("Creating artefacts...");

        // 2.  DB - create docker images
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            // Does it already exist?
            let existingDockerImage = await LoopbackTools.asyncCall(this.models.DockerImage, "findOne", {
                "where": {
                    "name": sp.container.dockerImage.name,
                    "version": sp.container.dockerImage.version
                }
            });
            // If no...
            if (!existingDockerImage) {
                // Create instance
                existingDockerImage = await LoopbackTools.asyncModelCreate(this.models.DockerImage, sp.container.dockerImage);
            }
            sp.container.dockerImage = existingDockerImage;
            sp.container.dockerImageId = existingDockerImage.id;
        });

        // 3.  DB - create networks (append alias in name)
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            if (sp.container.networks) {
                await asyncForEach(sp.container.networks, async (network, i) => {
                    network.name = `${data.alias}_${network.name}`;

                    // Does it already exist?
                    let existingNetwork = await LoopbackTools.asyncCall(this.models.Network, "findOne", {
                        "where": {
                            "name": network.name
                        }
                    });
                    // If no...
                    if (!existingNetwork) {
                        // Create instance
                        existingNetwork = await LoopbackTools.asyncModelCreate(this.models.Network, network);
                    }
                    sp.container.networks[i] = existingNetwork;
                });
            }
        });

        // 4.  DB - create containers (append alias in name)
        let containerNameIdMap = {};
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            let containerObjCopy = JSON.parse(JSON.stringify(sp.container));

            delete containerObjCopy.networks;
            delete containerObjCopy.nginxDockerLinks;
            delete containerObjCopy.dockerImage;
            containerObjCopy.dependsOn = [];

            containerObjCopy.name = `${data.alias}_${containerObjCopy.name}`;

            // Does it already exist?
            let existingContainer = await LoopbackTools.asyncCall(this.models.Container, "findOne", {
                "where": {
                    "name": containerObjCopy.name
                }
            });
            // If no...
            if (!existingContainer) {
                // Create instance
                existingContainer = await LoopbackTools.asyncModelCreate(this.models.Container, containerObjCopy);
            }
            sp.container.name = existingContainer.name;
            sp.container.id = existingContainer.id;

            containerNameIdMap[sp.container.name] = sp.container.id;

            // Now link networks if any
            if (sp.container.networks) {
                await asyncForEach(sp.container.networks, async (network) => {
                    await LoopbackTools.asyncModelLink(existingContainer.networks, network)
                });
            }
        });

        // 5.  DB - update containers "dependsOn" fields
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            if (sp.container.dependsOn) {
                let dbContainer = await LoopbackTools.asyncCall(this.models.Container, "findOne", {
                    "where": {
                        "id": sp.container.id
                    }
                });

                let updNeeded = false;
                await asyncForEach(sp.container.dependsOn, async (cName, i) => {
                    cName = `${data.alias}_${cName}`;
                    if (!dbContainer.dependsOn) {
                        dbContainer.dependsOn = [];
                    }
                    let dependOnExist = dbContainer.dependsOn.find(cid => cid == containerNameIdMap[cName]);
                    if (!dependOnExist) {
                        dbContainer.dependsOn.push(containerNameIdMap[cName]);
                        updNeeded = true;
                    }
                });
                if (updNeeded) {
                    await LoopbackTools.asyncModelSave(dbContainer);
                }
            }
        });

        // 6.  DB - create nginx preset parameters
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            await asyncForEach(sp.container.nginxDockerLinks, async (ndl) => {
                ndl.nginxConfig.nginxPresetParams.name = `(${data.alias}) ${ndl.nginxConfig.nginxPresetParams.name}`;
                // Does it already exist?
                let nginxPresetParams = await LoopbackTools.asyncCall(this.models.NginxPresetParams, "findOne", {
                    "where": {
                        "name": ndl.nginxConfig.nginxPresetParams.name
                    }
                });
                // If no...
                if (!nginxPresetParams) {
                    // Create instance
                    nginxPresetParams = await LoopbackTools.asyncModelCreate(this.models.NginxPresetParams, ndl.nginxConfig.nginxPresetParams);
                }

                ndl.nginxConfig.nginxPresetParamsId = nginxPresetParams.id;
            });
        });

        // 7.  DB - create nginx configs (append alias in name)
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            await asyncForEach(sp.container.nginxDockerLinks, async (ndl) => {
                let nginxConfigObjCopy = JSON.parse(JSON.stringify(ndl.nginxConfig));

                delete nginxConfigObjCopy.nginxPresetParams;

                nginxConfigObjCopy.name = `${data.alias}_${nginxConfigObjCopy.name}`;

                if (nginxConfigObjCopy.asSubdomain) {
                    domainSetupNeeded = true;
                }

                // Does it already exist?
                let existingNginxConfig = await LoopbackTools.asyncCall(this.models.NginxConfig, "findOne", {
                    "where": {
                        "name": nginxConfigObjCopy.name
                    }
                });
                // If no...
                if (!existingNginxConfig) {
                    // Create instance
                    existingNginxConfig = await LoopbackTools.asyncModelCreate(this.models.NginxConfig, nginxConfigObjCopy);
                }
                ndl.nginxConfig.name = existingNginxConfig.name;
                ndl.nginxConfig.id = existingNginxConfig.id;
            });
        });

        // 8.  DB - create nginx docker links
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            await asyncForEach(sp.container.nginxDockerLinks, async (ndl) => {
                // Does it already exist?
                let existingNginxDockerLink = await LoopbackTools.asyncCall(this.models.NginxDockerLink, "findOne", {
                    "where": {
                        "containerId": sp.container.id,
                        "nginxConfigId": ndl.nginxConfig.id
                    }
                });
                // If no...
                if (!existingNginxDockerLink) {
                    // Create instance
                    existingNginxDockerLink = await LoopbackTools.asyncModelCreate(this.models.NginxDockerLink, {
                        "containerId": sp.container.id,
                        "nginxConfigId": ndl.nginxConfig.id
                    });
                }
                ndl.id = existingNginxDockerLink.id;
                ndl.nginxConfigId = ndl.nginxConfig.id;
                ndl.containerId = sp.container.id;
            });
        });

        // 9.  DB - create solutions
        let solutionCopy = JSON.parse(JSON.stringify(solutionJson));
        delete solutionCopy.solutionParameters;

        // Does it already exist?
        let existingSolution = await LoopbackTools.asyncCall(this.models.Solution, "findOne", {
            "where": {
                "name": solutionJson.name
            }
        });

        // If no...
        if (!existingSolution) {
            // Create instance
            existingSolution = await LoopbackTools.asyncModelCreate(this.models.Solution, solutionCopy);
        }
        solutionJson.id = existingSolution.id;

        // 10. DB - create solution parameters
        await asyncForEach(solutionJson.solutionParameters, async (sp) => {
            let solutionParamCopy = JSON.parse(JSON.stringify(sp));
            solutionParamCopy.containerId = sp.container.id;
            delete solutionParamCopy.container;

            solutionParamCopy.solutionId = solutionJson.id;

            // Does it already exist?
            let existingSolutionParameter = await LoopbackTools.asyncCall(this.models.SolutionParameters, "findOne", {
                "where": {
                    "containerId": solutionParamCopy.containerId,
                    "solutionId": solutionParamCopy.solutionId
                }
            });
            // If no...
            if (!existingSolutionParameter) {
                // Create instance
                existingSolutionParameter = await LoopbackTools.asyncModelCreate(this.models.SolutionParameters, solutionParamCopy);
            }
        });

        // Done
        return domainSetupNeeded;
    }

    /**
     * buildDockerFile
     * @param {*} containerImage 
     * @param {*} rootFolder 
     */
    static async buildDockerFile(containerImage, rootFolder) {
        return new Promise((resolve, reject) => {
            let error = [];
            this._spawn(
                "docker",
                ["build", "-t", containerImage.name + (containerImage.version ? (":" + containerImage.version) : ":latest"), "."],
                rootFolder,
                (outMsg) => { // On log
                    console.log("OUT =>", outMsg);
                },
                (errMsg) => { // On error
                    error.push(errMsg);
                },
                () => { // Done
                    if (error.length > 0) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * _spawn
     * @param {*} cmd 
     * @param {*} params 
     * @param {*} workingDirectory 
     * @param {*} output 
     * @param {*} error 
     * @param {*} done 
     */
    static _spawn(cmd, params, workingDirectory, output, error, done) {
        const child = spawn(
            cmd,
            params ? params : [],
            workingDirectory ? {
                cwd: workingDirectory
            } : {}
        );

        child.stdout.on('data', (data) => {
            output(data.toString('utf8'));
        });

        child.stderr.on('data', (data) => {
            error(data.toString('utf8'));
        });

        child.on('close', (code) => {
            if (code == 0) {
                done();
            } else {
                done(new Error("An error occured"));
            }
        });
    }

    /**
     * _spawnPromise
     * @param {*} cmd 
     * @param {*} params 
     * @param {*} workingDirectory 
     */
    static _spawnPromise(cmd, params, workingDirectory) {
        return new Promise((resolve, reject) => {
            let output = [];
            let error = [];
            const child = spawn(
                cmd,
                params ? params : [],
                workingDirectory ? {
                    cwd: workingDirectory
                } : {}
            );

            child.stdout.on('data', (data) => {
                output.push(data.toString('utf8'));
            });

            child.stderr.on('data', (data) => {
                error.push(data.toString('utf8'));
            });

            child.on('close', (code) => {
                if (code == 0) {
                    let allData = output.join('').split('\n');
                    if (allData.length > 0 && allData[allData.length - 1] == '') {
                        allData.splice(allData.length - 1, 1);
                    }
                    resolve(allData);
                } else {
                    let allData = error.join('').split('\n');
                    if (allData.length > 0 && allData[allData.length - 1] == '') {
                        allData.splice(allData.length - 1, 1);
                    }
                    reject(allData);
                }
            });
        });
    }

    /**
     * zipExtract
     * @param {*} source 
     * @param {*} target 
     */
    static zipExtract(source, target) {
        return new Promise((resolve, reject) => {
            extract(source, { dir: target }, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
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

SolutionService.models = null;
module.exports = SolutionService;