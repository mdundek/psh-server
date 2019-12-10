'use strict';

module.exports = function (server) {
	var router = server.loopback.Router();

	// Ping endpoint to check for online conectivity
	router.get('/psh-ping', (req, res) => { res.send('ok') });

	server.use(router);
};
