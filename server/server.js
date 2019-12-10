'use strict';

global.__basedir = __dirname.substring(0, __dirname.length - 7);

// Set environement variables from .env file
require('dotenv').config();

const Env = require("../lib/env.js");

var loopback = require('loopback');
var boot = require('loopback-boot');
var multer = require("multer");

var app = module.exports = loopback();

app.use(loopback.token({
	model: app.models.AuthToken
}));

app.use(multer({ storage: multer.memoryStorage() }).any());

app.start = function () {
	// start the web server
	return app.listen(function () {
		app.emit('started');
		var baseUrl = app.get('url').replace(/\/$/, '');
		console.log('Web server listening at: %s', baseUrl);
		if (app.get('loopback-component-explorer')) {
			var explorerPath = app.get('loopback-component-explorer').mountPath;
			console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
		}
	});
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
	if (err) throw err;

	require("../services/nginx/nginx").init(app.models);
	require("../services/solution/solution").init(app.models);
	require("../common/custom-models").loadModels(app);

	let composeServices = require("../services/docker/compose");
	composeServices.init(app.models);
	if (Env.get("RUNTIME_ENV") == "prod") {
		console.log("=> Populating docker-compose .env file");
		composeServices.populateDockerComposeEnv().then(() => {
			console.log("=> Docker-compose .env file generated");
		}).catch((err) => {
			console.log("=> Error populating docker-compose .env file");
		});
	}

	// start the server if `$ node server.js`
	if (require.main === module) {
		require("../services/SocketIoController").init(app.start());
	}
});

