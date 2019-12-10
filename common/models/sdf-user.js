'use strict';

const loopbackTools = require("../loopback-model-tools");

module.exports = function (Sdfuser) {
    // Disable api endpoints
    loopbackTools.disableAllMethods(Sdfuser, [
        "login",
        "logout"
    ]);
};
