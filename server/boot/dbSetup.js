"use strict";

let async = require("async");
const Env = require("../../lib/env.js");
const LoopbackTools = require("../../common/loopback-model-tools");

module.exports = function (server) {

    // var ds = server.dataSources["sdf-ds"];
    // ds.automigrate(function () {

    // });

    async.waterfall([
        // Get default admin user config from VCAP
        // If owner is unit test, return specific test user credentials instead of production credentials
        (done) => {
            // Do we already have our acl data set in the DB? If not, we create the users and roles as necessary
            server.models.SdfUser.findOne({ where: { username: "admin" } }, (err, adminUser) => {
                if (err) {
                    done(err);
                    return;
                }
                done(null, adminUser);
            });
        },
        // Create admin Users
        (adminUser, done) => {
            if (adminUser == null) {
                server.models.SdfUser.create([
                    Object.assign({ "realm": "admin" }, Env.get("BASE_USERS").adminUser)
                ], function (err, adminUsers) {
                    if (err) {
                        done(err);
                        return;
                    }

                    // Create the admin role
                    server.models.Role.create([{
                        name: "admin"
                    }], function (err, roles) {
                        if (err) {
                            done(err);
                            return;
                        }

                        // Make admin user an admin
                        roles.find(r => r.name == "admin").principals.create({
                            principalType: server.models.RoleMapping.USER,
                            principalId: adminUsers[0].id
                        }, function (err, principal) {
                            if (err) {
                                done(err);
                                return;
                            }
                            done(null, adminUser);
                        });
                    });
                });
            } else {
                done(null, adminUser);
            }
        },
        // Create settings
        (adminUser, done) => {
            server.models.Settings.find({}, (err, settings) => {
                if (err) {
                    done(err);
                    return;
                }
                if (settings.length == 0) {
                    server.models.Settings.create(Env.get("INITIAL_SETTINGS"), function (err) {
                        if (err) {
                            done(err);
                            return;
                        }
                        done(null, adminUser);
                    });
                } else {
                    done(null, adminUser);
                }
            });
        },
        // Create Nginx default proxy config
        (adminUser, done) => {
            server.models.NginxPresetParams.find({}, (err, params) => {
                if (err) {
                    done(err);
                    return;
                }
                if (params.length == 0) {
                    server.models.NginxPresetParams.create([
                        { 
                            "name": "Proxy redirect headers - default", 
                            "list": [
                                "proxy_set_header Host             $host", 
                                "proxy_set_header X-Real-IP        $remote_addr", 
                                "proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for", 
                                "proxy_set_header X-Client-Verify  SUCCESS", 
                                "proxy_set_header X-Client-DN      $ssl_client_s_dn", 
                                "proxy_set_header X-SSL-Subject    $ssl_client_s_dn", 
                                "proxy_set_header X-SSL-Issuer     $ssl_client_i_dn", 
                                "proxy_read_timeout 1800", 
                                "proxy_connect_timeout 1800"
                            ] 
                        }
                    ], function (err) {
                        if (err) {
                            done(err);
                            return;
                        }
                        done(null, adminUser);
                    });
                } else {
                    done(null, adminUser);
                }
            });
        }
    ], (err) => {
        if (err) {
            console.log("!!! DB Init error =>", err);
        }
    });
};