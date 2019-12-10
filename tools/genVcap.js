#!/usr/bin/env node

const fs = require('fs');

String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

let escape = false;
let env = null;
let rootPath = null;
process.argv.forEach((arg) => {
    let argSplit = arg.split("=");
    if (argSplit.length == 2) {
        switch (argSplit[0]) {
            case 'escape':
                escape = argSplit[1] == "true";
                break;
            case 'env':
                env = argSplit[1];
                break;
            case 'root':
                rootPath = argSplit[1];
                break;
        }
    }
});

if (!env) {
    return process.exit(1);
}

let envObject = require(`../env.${env}.json`);
let jsonString = JSON.stringify(envObject);

if (rootPath) {
    jsonString = jsonString.replaceAll("__PSH_HOME_DIR__", rootPath);
}

if (escape) {
    console.log(jsonString.replaceAll('\"', '\\"'));
} else {
    // Delete previous config file
    if (fs.existsSync("../.env")) {
        fs.unlinkSync("../.env");
    }
    // Save content to config file
    fs.writeFileSync("../.env", `VCAP='${jsonString}'`);
}