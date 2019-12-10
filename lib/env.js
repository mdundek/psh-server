/**
 * ConfigService
 */
class ConfigService {
    /**
     * Init
     */
    constructor() {
        this.VCAP = JSON.parse(process.env.VCAP);
    }

    /**
     * Get a vcap config parameter
     */
    get(name) {
        return this.VCAP[name];
    }
}

module.exports = new ConfigService();