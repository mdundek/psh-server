"use strict";

module.exports = {
    "sdf-ds": process.env.RUNTIME_ENV == "test" ?
        {
            "name": "sdf-ds",
            "localStorage": "",
            "file": "sdf-db-test.json",
            "connector": "memory"
        } : require("../lib/env.js").get("MEM_DB")
};