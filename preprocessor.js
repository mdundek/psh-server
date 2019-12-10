'use strict';

module.exports = {
	process(src) {
		return `
			// a jest transform inserted this code:
			require.extensions = {
				'.js': function () {},
				'.json': function () {},
				'.node': function () {},
				'.ejs': function () {},
			}
			// end jest transform
			${src}`
	},
}