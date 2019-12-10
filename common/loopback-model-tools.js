"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

/**
 * Disable REST methods, except the passed on exceptions
 * @param {*} model 
 * @param {*} methodsToExpose 
 */
function disableAllMethods(model, methodsToExpose) {
    // create
    // patchOrCreate
    // replaceOrCreate
    // upsertWithWhere
    // exists
    // findById
    // replaceById
    // find
    // findOne
    // updateAll
    // deleteById
    // count
    // patchAttributes
    // createChangeStream
    // prototype.patchAttributes
    // prototype.__findById__deviceEvents
    // prototype.__destroyById__deviceEvents
    // prototype.__updateById__deviceEvents
    // prototype.__exists__deviceEvents
    // prototype.__link__deviceEvents
    // prototype.__get__deviceEvents
    // prototype.__create__deviceEvents
    // prototype.__update__deviceEvents
    // prototype.__destroy__deviceEvents
    // prototype.__unlink__deviceEvents
    // prototype.__count__deviceEvents
    // prototype.__delete__deviceEvents
    // prototype.__findById__deviceType
    // prototype.__destroyById__deviceType
    // prototype.__updateById__deviceType
    // prototype.__exists__deviceType
    // prototype.__link__deviceType
    // prototype.__get__deviceType
    // prototype.__create__deviceType
    // prototype.__update__deviceType
    // prototype.__destroy__deviceType
    // prototype.__unlink__deviceType
    // prototype.__count__deviceType
    // prototype.__delete__deviceType
    if (model && model.sharedClass) {
        methodsToExpose = methodsToExpose || [];
        var modelName = model.sharedClass.name;
        var methods = model.sharedClass.methods();
        var relationMethods = [];
        var hiddenMethods = [];

        try {
            relationMethods.push({ name: "prototype.patchAttributes" });
            Object.keys(model.definition.settings.relations).forEach(function (relation) {
                relationMethods.push({ name: "prototype.__findById__" + relation });
                relationMethods.push({ name: "prototype.__destroyById__" + relation });
                relationMethods.push({ name: "prototype.__updateById__" + relation });
                relationMethods.push({ name: "prototype.__exists__" + relation });
                relationMethods.push({ name: "prototype.__link__" + relation });
                relationMethods.push({ name: "prototype.__get__" + relation });
                relationMethods.push({ name: "prototype.__create__" + relation });
                relationMethods.push({ name: "prototype.__update__" + relation });
                relationMethods.push({ name: "prototype.__destroy__" + relation });
                relationMethods.push({ name: "prototype.__unlink__" + relation });
                relationMethods.push({ name: "prototype.__count__" + relation });
                relationMethods.push({ name: "prototype.__delete__" + relation });
            });
        } catch (err) { }
        methods.concat(relationMethods).forEach(function (method) {
            if (methodsToExpose.indexOf(method.name) < 0) {
                hiddenMethods.push(method.name);
                model.disableRemoteMethodByName(method.name);
            }
        });
    }
}
exports.disableAllMethods = disableAllMethods;

/**
 * asyncModelSave
 */
exports.asyncModelSave = (modelInstance, trxOptions) => {
    return new Promise((resolve, reject) => {
        if (trxOptions) {
            modelInstance.save(trxOptions, (err, dbInstance) => {
                if (err) {
                    return reject(err);
                }
                resolve(dbInstance);
            });
        } else {
            modelInstance.save((err, dbInstance) => {
                if (err) {
                    return reject(err);
                }
                resolve(dbInstance);
            });
        }
    });
}

/**
 * asyncModelCreate
 */
exports.asyncModelCreate = (model, modelInstance, trxOptions) => {
    return new Promise((resolve, reject) => {
        if (trxOptions) {
            model.create(modelInstance, trxOptions, (err, dbInstance) => {
                if (err) {
                    return reject(err);
                }
                resolve(dbInstance);
            });
        } else {
            model.create(modelInstance, (err, dbInstance) => {
                if (err) {
                    return reject(err);
                }
                resolve(dbInstance);
            });
        }
    });
}

/**
 * asyncModelCreate
 */
exports.asyncModelLink = (modelLink, child) => {
    return new Promise((resolve, reject) => {
        modelLink.add(child, function (err) {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

/**
 * asyncModelDelete
 */
exports.asyncModelDelete = (modelInstance, trxOptions) => {
    return new Promise((resolve, reject) => {
        if (trxOptions) {
            modelInstance.destroy(trxOptions, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        } else {
            modelInstance.destroy((err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        }
    });
}

/**
 * asyncModelDeleteById
 */
exports.asyncModelDeleteById = (modelInstance, id, trxOptions) => {
    return new Promise((resolve, reject) => {
        if (trxOptions) {
            modelInstance.destroyById(id, trxOptions, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        } else {
            modelInstance.destroyById(id, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        }
    });
}

/**
 * asyncModelDeleteById
 */
exports.asyncModelDeleteWhere = (modelInstance, where, trxOptions) => {
    return new Promise((resolve, reject) => {
        if (trxOptions) {
            modelInstance.destroyAll(where, trxOptions, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        } else {
            modelInstance.destroyAll(where, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        }
    });
}

/**
 * Make async calls to loopback api's
 * @param {*} model 
 * @param {*} api 
 * @param {*} params 
 */
exports.asyncCall = (model, api, params, trxOptions) => {
    return new Promise((resolve, reject) => {
        if (params != null) {
            if (trxOptions) {
                model[api](params, trxOptions, (err, response) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(response);
                });
            } else {
                model[api](params, (err, response) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(response);
                });
            }
        } else {
            if (trxOptions) {
                model[api](trxOptions, (err, response) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(response);
                });
            } else {
                model[api]((err, response) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(response);
                });
            }
        }
    });
};

/**
 * asyncBeginTransaction
 */
exports.asyncBeginTransaction = (model) => {
    return new Promise((resolve, reject) => {
        model.beginTransaction({
            isolationLevel: model.Transaction.READ_COMMITTED,
            timeout: 30000
        }, (err, tx) => {
            if (err) return reject(err);
            resolve(tx);
        });
    });
};

/**
 * asyncCommit
 */
exports.asyncCommit = (trxOptions) => {
    return new Promise((resolve, reject) => {
        trxOptions.transaction.commit((_err) => {
            if (_err) {
                return reject(_err);
            }
            resolve();
        });
    });
};

/**
 * asyncRollback
 */
exports.asyncRollback = (trxOptions) => {
    return new Promise((resolve, reject) => {
        trxOptions.transaction.rollback(() => {
            resolve();
        });
    });
};

