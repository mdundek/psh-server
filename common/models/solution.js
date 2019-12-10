'use strict';

var fs = require('fs');
var path = require('path');
const { spawn } = require('child_process');
var extract = require('extract-zip');
var rimraf = require("rimraf");
var archiver = require('archiver');

const LoopbackTools = require("../loopback-model-tools");

/**
 * zipExtract
 * @param {*} source 
 * @param {*} target 
 */
let zipExtract = (source, target) => {
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
let removeDir = (path) => {
    return new Promise((resolve, reject) => {
        rimraf(path, function () {
            resolve();
        });
    });
}

/**
 * _spawn
 */
let _spawn = (cmd, params, workingDirectory, output, error, done) => {
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
 * _spawn
 */
let _spawnPromise = (cmd, params, workingDirectory) => {
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

module.exports = function (Solution) {

    /**
     * exportSolution
     */
    Solution.exportSolution = function (solutionId, req, res, options, cb) {
        // -------------------------------------------
        // 1. Create temporary folder for this solution
        // 2. Save docker files to temp folder
        // 3. Create solution JSON file containing:
        //      - Docker Images DB objects
        //      - Network DB objects
        //      - Container DB objects
        //      - NGinx preset parameters
        //      - NGinx DB Objects (remove basic auth configs and domains)
        //      - Solution DB object
        //      - Create solution parameters DB objects
        // 4. ZIP the temporary folder and send it back to the user
        // -------------------------------------------

        (async () => {
            // Get the solution object
            let solution = await LoopbackTools.asyncCall(Solution, "findOne", {
                "where": {
                    "id": solutionId
                },
                "include": {
                    "solutionParameters": {
                        "container": [
                            "dockerImage",
                            "networks",
                            {
                                "nginxDockerLinks": [
                                    {
                                        "nginxConfig": [
                                            "nginxPresetParams"
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            });
            let solutionJson = solution.toJSON();

            // Define temporary working folder path and it's subfolders
            let tempSolutionFolder = path.join(global.__basedir, '.solution');

            // Clean up first
            if (fs.existsSync(tempSolutionFolder)) {
                await removeDir(tempSolutionFolder, { recursive: true });
            }
            fs.mkdirSync(tempSolutionFolder, { recursive: true });

            let tempSolutionSubFolder = path.join(tempSolutionFolder, solution.name);
            fs.mkdirSync(tempSolutionSubFolder, { recursive: true });

            let tempSolutionDockerfilesFolder = path.join(tempSolutionSubFolder, 'docker-images');
            fs.mkdirSync(tempSolutionDockerfilesFolder, { recursive: true });

            try {
                let dockerfileContainerMap = {};
                // Start with potential docker file zips
                for (let i = 0; i < req.files.length; i++) {
                    let imageContainerId = req.files[0].fieldname.substring(14);
                    let dockerfileZipPath = path.join(tempSolutionDockerfilesFolder, imageContainerId + ".zip");

                    // Prepare unzip folder
                    let dockerfileFolderPath = path.join(tempSolutionDockerfilesFolder, imageContainerId);
                    if (!fs.existsSync(dockerfileFolderPath)) {
                        fs.mkdirSync(dockerfileFolderPath, { recursive: true });
                    }

                    // Write zip file to disk
                    fs.writeFileSync(dockerfileZipPath, req.files[i].buffer);

                    // Extract
                    await zipExtract(dockerfileZipPath, dockerfileFolderPath);

                    // Remove file from disk
                    fs.unlinkSync(dockerfileZipPath);

                    if (!fs.existsSync(path.join(dockerfileFolderPath, "Dockerfile"))) {
                        throw new Error("Invalide Dockerfile folder.");
                    }

                    dockerfileContainerMap[imageContainerId] = dockerfileFolderPath;
                }

                // Rename dockerfile folders according to the container instance names
                solutionJson.solutionParameters.forEach(sp => {
                    if (dockerfileContainerMap[sp.container.id]) {
                        let targetFolderName = path.join(
                            dockerfileContainerMap[sp.container.id].substring(0, dockerfileContainerMap[sp.container.id].lastIndexOf(path.sep)),
                            sp.container.name
                        );
                        fs.renameSync(dockerfileContainerMap[sp.container.id], targetFolderName);
                    }
                });

                // Resolve contyainer depends on IDs
                solutionJson.solutionParameters.forEach(sp => {
                    if (sp.container.dependsOn) {
                        sp.container.dependsOn = sp.container.dependsOn.map(cid => {
                            let dependsOnContainer = solutionJson.solutionParameters.find(sp => sp.container.id == cid);
                            return dependsOnContainer ? dependsOnContainer.container.name : null;
                        }).filter(cn => cn != null);
                    }
                });

                // Clean up id's for all objects, we dont want to export those
                delete solutionJson.id;
                solutionJson.solutionParameters.forEach(sp => {
                    delete sp.id;
                    delete sp.solutionId;
                    delete sp.containerId;
                    delete sp.container.id;
                    delete sp.container.dockerImageId;
                    delete sp.container.dockerImage.id;
                    sp.container.nginxDockerLinks.forEach(ndl => {
                        delete ndl.id;
                        delete ndl.nginxConfigId;
                        delete ndl.containerId;
                        delete ndl.nginxConfig.id;
                        delete ndl.nginxConfig.domainId;
                        delete ndl.nginxConfig.nginxPresetParamsId;
                        delete ndl.nginxConfig.nginxPresetParams.id;
                    });
                    if (sp.container.networks) {
                        sp.container.networks.forEach(n => {
                            delete n.id;
                        });
                    }
                });

                // Write solution json file to temp solution foldder
                fs.writeFileSync(path.join(tempSolutionSubFolder, "solution.json"), JSON.stringify(solutionJson, null, 4));

                // Create zip file with all artefacts
                let zipTargetFilePath = path.join(tempSolutionFolder, "solution.zip");
                var output = fs.createWriteStream(zipTargetFilePath);
                var archive = archiver('zip', {
                    zlib: { level: 9 } // compression level.
                });
                // 'close' event is fired only when a file descriptor is involved
                output.on('close', function () {
                    // Done, now send back zip file
                    var data = fs.readFileSync(zipTargetFilePath);
                    // Then serve it
                    res.set("content-type", "application/zip");
                    res.set("content-length", data.length);
                    res.set("X-Download-Options", "");
                    res.status(200).send(data);
                });
                archive.on('warning', function (err) {
                    if (err.code != 'ENOENT') {
                        throw err;
                    }
                });
                archive.on('error', function (err) {
                    throw err;
                });
                archive.pipe(output);
                archive.directory(tempSolutionSubFolder, false);
                archive.finalize();
            } catch (err) {
                console.log(err);
                // res.status(500);
                cb(err);
            }
        })();
    };

    Solution.remoteMethod("exportSolution", {
        description: "Export solution",
        accepts: [
            { arg: "solutionId", type: 'string', required: true },
            { arg: "req", type: "object", "http": { source: "req" } },
            { arg: "res", type: "object", "http": { source: "res" } },
            { arg: "options", type: "object", description: "options", http: "optionsFromRequest" }
        ],
        http: {
            path: "/exportSolution/:solutionId",
            verb: "POST"
        },
        return: [{
            arg: "body",
            type: "file",
            root: true
        },
        {
            arg: "Content-Type",
            type: "string",
            http: { target: "header" }
        }
        ]
    });

    /**
     * importSolution
     */
    Solution.importSolution = function (req, res, options, cb) {
        (async () => {
            try {
                // Define temporary working folder path and it's subfolders
                let tempSolutionFolder = path.join(global.__basedir, '.solution');

                // Clean up first
                if (fs.existsSync(tempSolutionFolder)) {
                    await removeDir(tempSolutionFolder);
                }
                fs.mkdirSync(tempSolutionFolder, { recursive: true });

                let solutionTargetZipPath = path.join(tempSolutionFolder, "solution.zip");

                let solutionTargetFolderPath = path.join(tempSolutionFolder, "import");
                fs.mkdirSync(solutionTargetFolderPath, { recursive: true });

                // Write zip file to disk
                fs.writeFileSync(solutionTargetZipPath, req.files[0].buffer);

                // Now unzip solution
                await zipExtract(solutionTargetZipPath, solutionTargetFolderPath);

                // Remove file from disk
                fs.unlinkSync(solutionTargetZipPath);

                // Prepare for import
                let solutionJsonFilePath = path.join(solutionTargetFolderPath, "solution.json");

                let solutionJson = JSON.parse(fs.readFileSync(solutionJsonFilePath, "utf8"));

                // Make sure the solution name is not already present in this setup
                let solution = await LoopbackTools.asyncCall(Solution, "findOne", {
                    "where": {
                        "name": solutionJson.name
                    }
                });
                if (solution) {
                    return cb(null, {
                        success: false,
                        message: "A solution with the same name " + solutionJson.name + " already exists."
                    });
                }

                let solutionContainerBuildFolderPath = path.join(solutionTargetFolderPath, "docker-images");
                let containerBuildDirs = fs.readdirSync(solutionContainerBuildFolderPath).map(fileName => {
                    return { "root": path.join(solutionContainerBuildFolderPath, fileName), "name": fileName };
                });

                // Done
                cb(null, {
                    success: true,
                    containerBuildDirs: containerBuildDirs,
                    solutionJsonFilePath: solutionJsonFilePath
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

    Solution.remoteMethod("importSolution", {
        description: "Import solution",
        accepts: [
            { arg: "req", type: "object", "http": { source: "req" } },
            { arg: "res", type: "object", "http": { source: "res" } },
            { arg: "options", type: "object", description: "options", http: "optionsFromRequest" }
        ],
        http: {
            path: "/importSolution",
            verb: "POST"
        },
        returns: [{
            arg: "data",
            type: "object"
        }]
    });
};
