
/* Copyright (c) 2015-2016, <Christopher Chin>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the <organization> nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */
/**
 * 
 */
"use strict";

var NoGapDef = require('nogap').Def;

module.exports = NoGapDef.component({
    /**
     * Everything defined in `Host` lives only on the host side (Node).
     */
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { 
        return {
            Assets: {
                Files: {
                    string: {
                        template: 'ScannerPage.html'
                    }
                },
                AutoIncludes: {
                }
            },
                    
            /**
             * 
             */
            initHost: function() {
                
            },
            
            /**
             * Host commands can be directly called by the client
             */
            Public: {
                
            },
        };
    }),
    
    
    /**
     * Everything defined in `Client` lives only in the client (browser).
     */
    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        var ThisComponent;

        return {
            ScannerSettings: {
                timeFrameSeconds: 600000000
            },

            __ctor: function() {
                ThisComponent = this;
                this.ScannerView = { open: {} };
                this.scannedMacs = [];
                this.colorsPerMacId = {};
            },

            initClient: function() {
                this.ScannerSettings.timeFrameSeconds = Instance.AppConfig.getValue('scannerTimeFrameSeconds') || 60;
            },

            /**
             * Prepares the scanner page controller.
             */
            setupUI: function(UIMgr, app) {
                // create Scanner controller
                app.lazyController('scannerCtrl', function($scope) {
                    UIMgr.registerPageScope(ThisComponent, $scope);
                    
                    // customize your ScannerPage's $scope here:
                    $scope.ScannerView = ThisComponent.ScannerView;
                    $scope.ignoreCache = Instance.WifiScannerIgnoreList.wifiscannerIgnoreList;
                    $scope.historyCache = Instance.WifiScannerHistory.wifiScannerHistory;
                });

                // register page
                Instance.UIMgr.registerPage(this, 'Scanner', this.assets.template, {
                    iconClasses: 'fa fa-wifi'
                });
            },


            runPromise: function(promise) {
                ThisComponent.busy = true;
                ThisComponent.page.invalidateView();

                return promise
                .finally(function() {
                    ThisComponent.busy = false;
                    ThisComponent.page.invalidateView();
                })
                .catch(ThisComponent.page.handleError.bind(ThisComponent));
            },


            refreshDelay: 1000,

            refreshData: function() {
                ThisComponent.scanning = true;
                ThisComponent.page.invalidateView();
                
                return Promise.join(
                    Instance.CommonDBQueries.queries.CurrentlyScannedMACs(ThisComponent.ScannerSettings)
                    .then(function(scannedMacs) {
                        // // first merge in new entries
                        // _.merge(ThisComponent.scannedMacs, scannedMacs);

                        // // then remove all missing entries
                        // _.remove(ThisComponent.scannedMacs, function(entry) {
                        //     return !_.find(scannedMacs, {macId: entry.macId});
                        // });
                        ThisComponent.scannedMacs = scannedMacs;
                    }),

                    Instance.WifiScannerIgnoreList.wifiscannerIgnoreList.readObjects(),

                    Instance.WifiScannerHistory.wifiScannerHistory.readObjects()
                )
                .finally(function() {
                    ThisComponent.scanning = false;
                    ThisComponent.page.invalidateView();
                })
                .catch(ThisComponent.page.handleError.bind(ThisComponent));;
            },

            toggleHistory: function(macEntry) {
                var historyCache = Instance.WifiScannerHistory.wifiScannerHistory;
                var historyEntry = historyCache.indices.macId.get(macEntry.macId);
                if (historyEntry) {
                    // remove
                    this.runPromise(historyCache.deleteObject(historyEntry));
                }
                else {
                    // add
                    this.runPromise(historyCache.createObject({
                        macId: macEntry.macId
                    }));
                }
            },

            toggleIgnore: function(macEntry) {
                var ignoreCache = Instance.WifiScannerIgnoreList.wifiscannerIgnoreList;
                var ignoreEntry = ignoreCache.indices.macId.get(macEntry.macId);
                if (ignoreEntry) {
                    // remove
                    this.runPromise(ignoreCache.deleteObject(ignoreEntry));
                }
                else {
                    // add
                    this.runPromise(ignoreCache.createObject({
                        macId: macEntry.macId
                    }));
                }
            },

            // ################################################################################################
            // Annotations

            onMACAnnotationUpdated: function(macId, macAnnotation) {
                ThisComponent.busy = true;

                //ThisComponent.host.updateMACAnnotation(macId, macAnnotation)
                Instance.MACAddress.macAddresses.updateObject({
                    macId: macId,
                    macAnnotation: macAnnotation
                })
                .finally(function() {
                    ThisComponent.busy = false;
                })
                .then(function() {
                    ThisComponent.page.invalidateView();
                })
                .catch(ThisComponent.page.handleError.bind(ThisComponent));
            },
            
            /**
             * Client commands can be directly called by the host
             */
            Public: {
                
            }
        };
    })
});
