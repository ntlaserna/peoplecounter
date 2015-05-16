/**
 * This component is responsible for configuring, resetting and maintaining device status
 */
"use strict";

var NoGapDef = require('nogap').Def;

module.exports = NoGapDef.component({
    /**
     * Everything defined in `Base` is available on Host and Client.
     */
    Base: NoGapDef.defBase(function(SharedTools, Shared, SharedContext) { return {
        /**
         * 
         */
        initBase: function() {
            
        },
    };}),

    /**
     * Everything defined in `Host` lives only on the host side (Node).
     */
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { 
        var componentsRoot = '../';
        var libRoot = componentsRoot + '../lib/';
        var SequelizeUtil;
        var TokenStore;

        var externalUrl;

        return {
            __ctor: function () {
                SequelizeUtil = require(libRoot + 'SequelizeUtil');
                TokenStore = require(libRoot + 'TokenStore');
            },

            /**
             * 
             */
            initHost: function(app, cfg) {
                externalUrl = app.externalUrl;
            },

            Private: {
                onClientBootstrap: function() {
                },

                getDeviceConfig: function(device) {
                    var DefaultConfig = Shared.AppConfig.getValue('deviceConfigDefaults');
                    console.assert(DefaultConfig, 'Could not get `deviceConfigDefaults`. Make sure to define it in `appConfig[.user].js`, then restart the server!');

                    // generate and return config, derived from DefaultConfig
                    var cfg = _.clone(DefaultConfig);

                    cfg.HostUrl = externalUrl;

                    if (device) {
                        cfg.deviceId = device.deviceId;
                    }

                    return cfg;
                },

                generateIdentityToken: function(device) {
                    return TokenStore.generateTokenString(256);
                },

                generateRootPassword: function(device) {
                    return TokenStore.generateTokenString(32);
                },

                tryResetDevice: function(device, newDeviceStatus) {
                	var DeviceStatusId = Shared.DeviceStatus.DeviceStatusId;
                	var resetTimeout = new Date(device.resetTimeout);
                    var now = new Date();

                    if (resetTimeout.getTime() < now.getTime()) {
                        // fail: reset time is already up!
                        newDeviceStatus.deviceStatus = DeviceStatusId.LoginResetFailed;
                        return Promise.reject('device reset expired');
                    }

                    // device is scheduled for reset
                    newDeviceStatus.deviceStatus = DeviceStatusId.LoginReset;

                    this.Tools.logWarn('Resetting device #' + device.deviceId + '`...');

                    // NOTE: We cannot "return" the following promise, since it requires a reply from the client;
                    //      however, the client cannot reply, if we are blocking on this promise.
                    // Instead, after a successful reset, the device will call `tryLogin` again.
                    this.Instance.DeviceConfiguration.startResetConfiguration(device)
                    .bind(this)
                    .then(function() {
                        // update reset status in DB
                        device.resetTimeout = null;
                        device.isAssigned = 1;

                		var deviceCache = this.Instance.WifiSnifferDevice.wifiSnifferDevices;
                        return deviceCache.updateObject(device, true);
                    })
                    .catch(function(err) {
                        // fail: Could not reset
                        newDeviceStatus.deviceStatus = DeviceStatusId.LoginResetFailed;

                        // store device status a second time
                        this.Instance.DeviceStatus.logStatus(newDeviceStatus);

                        return Promise.reject(err);
                    });
                },

                /**
                 * Starts resetting configuration of the given device on the current client.
                 * Will not complete since it requires client-side acks, which can (currently) only be sent
                 * after all promises have been fulfilled.
                 */
                startResetConfiguration: function(device) {
                    return Promise.resolve()
                    .bind(this)
                    .then(function() {
                        return this.getDeviceConfig(device);
                    })
                    .then(function(cfg) {
                        // get a new identity token
                        return this.startRefreshingIdentityToken(device, cfg);
                    });
                },

                /**
                 * Send new identityToken to client.
                 * Returns a promise to be resolved when the client replies.
                 * NOTE: Will not block current Client request when using HTTP.
                 *
                 * @param cfg Optional: New configuration object.
                 */
                startRefreshingIdentityToken: function(device, cfg) {
                    if (this._deviceIdentityTokenRefresh) {
                        // already in progress
                        return Promise.reject(makeError('error.invalid.request', 'Device tried to `startRefreshingIdentityToken` while still refreshing'));
                    }

                    // re-generate identityToken
                    var oldIdentityToken = device.identityToken;
                    var newIdentityToken = this.generateIdentityToken(device);

                    // udpate client side of things
                    //      and wait for ACK
                    this._deviceIdentityTokenRefresh = {
                        device: device,
                        newIdentityToken: newIdentityToken,
                        result: null,
                        monitor: new SharedTools.Monitor(3000)
                    };

                    // we cannot generate a reliable promise chain here because we need all promises to be 
                    //      fulfilled before the client will actually call the next method.
                    this.Tools.log('Refreshing device identity for device #' + device.deviceId + '...');
                    this.client.updateIdentityToken(newIdentityToken, oldIdentityToken, cfg);

                    return this._deviceIdentityTokenRefresh.monitor;
                },
            },
            
            /**
             * Host commands can be directly called by the client
             */
            Public: {
                getDeviceConfigPublic: function(deviceId) {
                    if (!this.Instance.User.isStaff()) {
                        return Promise.reject('error.invalid.permissions');
                    }

                    return this.Instance.WifiSnifferDevice.wifiSnifferDevices.getObject({
                        deviceId: deviceId
                    })
                    .bind(this)
                    .then(function(device) {
                        var settings = {
                            cfg: this.getDeviceConfig(device),
                            identityToken: device.identityToken,
                            rootPassword: device.rootPassword
                        };

                        // TODO: User authentication (publicKey + privateKey)

                        return settings;
                    });
                },

                /**
                 * Client ACKnowledged identityToken update
                 */
                deviceIdentityRefreshAck: function(deviceId, oldIdentityToken) {
                    var refreshData = this._deviceIdentityTokenRefresh;
                    if (!refreshData) return Promise.reject(makeError('error.invalid.request'));

                    var device = refreshData.device;
                    console.assert(device);

                    // Notify on monitor!
                    var monitor = refreshData.monitor;

                    if (deviceId != device.deviceId) {
                        // invalid deviceId
                        return monitor.notifyReject(makeError('error.invalid.request', 'invalid `deviceId`'));
                    }

                    else if (oldIdentityToken !== device.identityToken) {
                        // invalid identityToken
                        return monitor.notifyReject(makeError('error.invalid.request', 'invalid `identityToken`'));
                    }

                    else {
                        // client-side update was a success!
                            
                        // save to DB
                        return this.Instance.WifiSnifferDevice.wifiSnifferDevices.updateObject({
                            deviceId: device.deviceId,
                            identityToken: refreshData.newIdentityToken,
                            isAssigned: 1,
                            resetTimeout: null
                        }, true)
                        .bind(this)
                        .then(function() {
                            return monitor.notifyResolve();
                        })
                        .catch(function(err) {
                            this.Tools.handleError(err, 
                            	'`identityToken` refresh failed for device #' + device.deviceId + '');

                            return monitor.notifyReject(makeError('error.internal'));
                        })
                        .finally(function() {
                            // everything is over -> unset
                            this._deviceIdentityTokenRefresh = null;
                        }.bind(this));
                    }
                }
            },
        };
    }),
    
    
    /**
     * Everything defined in `Client` lives only in the client (browser).
     */
    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        var ThisComponent;
        var request;

        return {
            __ctor: function() {
                ThisComponent = this;
            },

            /**
             * Device has initialized
             */
            initClient: function() {
            },

            /**
             * This function is here (and not in the DeviceClient starter script) because
             * it is not needed during start-up.
             */
            writeDeviceConfig: function(cfg) {
                var contentString = JSON.stringify(cfg, null, '\t');
                fs.writeFileSync(GLOBAL.DEVICE.ConfigFilePath, contentString);
            },

            readIdentityToken: function() {
                var fpath = GLOBAL.DEVICE.Config.HostIdentityTokenFile;
                if (!fpath) {
                    // need a reset
                    throw new Error('config corrupted: `HostIdentityTokenFile` missing');
                }
                return fs.readFileSync(fpath).toString();
            },

            writeIdentityToken: function(newIdentityToken) {
                var fpath = GLOBAL.DEVICE.Config.HostIdentityTokenFile;
                if (!fpath) {
                    // need a reset
                    throw new Error('config corrupted: `HostIdentityTokenFile` missing');
                }
                fs.writeFileSync(fpath, newIdentityToken);
            },

            /**
             * Client commands can be directly called by the host
             */
            Public: {
                /**
                 * Called by server to reset identityToken and (optionally) configuration.
                 * This is also called when a new device connects to the server for the first time, and is assigned a new configuration.
                 */
                updateIdentityToken: function(newIdentityToken, oldIdentityToken, newConfig) {
                    // TODO: Update root password
                    console.warn('Resetting device configuration...');

                    request = require('request');   // HTTP client module

                    return Promise.resolve()
                    .bind(this)
                    .then(function() {
                        if (newConfig) {
                            // write new config to file, if it exists
                            this.writeDeviceConfig(newConfig);

                            // then, read config (to make sure it worked!)
                            GLOBAL.DEVICE.readDeviceConfig();
                        }
                    })
                    .then(function() {
                        // then delete cookies on file and in memory

                        // empty cookies file
                        fs.writeFileSync(DEVICE.Config.CookiesFile, '');

                        // reset cookies jar
                        var jar = request.jar(new FileCookieStore(DEVICE.Config.CookiesFile));
                        request = request.defaults({ jar : jar })
                    })
                    .then(function() {
                        // then update identityToken
                        return this.writeIdentityToken(newIdentityToken);
                    })
                    .then(function() {
                        // tell Host, we are done
                        return this.host.deviceIdentityRefreshAck(newConfig.deviceId, oldIdentityToken);
                    })
                    .then(function() {
                        if (newConfig) {
                            // try logging in again, after config reset!
                            return Instance.DeviceMain.tryLogin();
                        }
                    })
                    .catch(function(err) {
                        console.error(err.stack || err);

                        // re-try reset?
                        // return Promise.delay(3000)
                        // .bind(this)
                        // .then(function() {
                        //     var cfg = GLOBAL.DEVICE.Config;
                        //     return Instance.DeviceMain.requestReset(cfg && cfg.deviceId);
                        // });
                    });
                }
            }
        };
    })
});