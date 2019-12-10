"use strict";

var loopback = require("loopback");

let modelSettings = { "public": false, "idInjection": false, "dataSource": null };

exports.loadModels = function (app) {

    // // Registration model
    // app.model(loopback.createModel({
    //     "name": "registerUser",
    //     "properties": {
    //         "userFirstName": { "type": "string", "id": true },
    //         "userLastName": { "type": "string" },
    //         "birthDate": { "type": "date" },
    //         "email": { "type": "string" },
    //         "username": { "type": "string" },
    //         "password": { "type": "string" }
    //     }
    // }), modelSettings);
};