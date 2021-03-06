
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
 * A dataset is a batch of packets captured with a particular device in a particular time frame.
 * Each device can only participate in one dataset at a time, and during the duration of that dataset, cannot (should not) be moved.
 */
"use strict";


var NoGapDef = require('nogap').Def;


module.exports = NoGapDef.component({
    Base: NoGapDef.defBase(function(SharedTools, Shared, SharedContext) {
    	return {
            Caches: {
                wifiDatasets: {
                    idProperty: 'datasetId',

                    hasHostMemorySet: 1,

                    members: {
                        compileReadObjectsQuery: function(queryInput) {
                            var queryData = {
                                where: {}
                            };

                            queryData.include = [{
                                model: Shared.WifiDatasetSnifferRelation.Model,
                                as: 'deviceRelations'
                            }];

                            return queryData;
                        }
                    }
                }
            },
            
	    	Private: {
	    	}
	    };
	}),


    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        var componentsRoot = '../../';
        var libRoot = componentsRoot + '../lib/';
        var SequelizeUtil;

        return {
            __ctor: function () {
                SequelizeUtil = require(libRoot + 'SequelizeUtil');
            },

            initModel: function() {
                var This = this;

                /**
                 * 
                 */
                return sequelize.define('WifiDataSet', {
                    datasetId: {type: Sequelize.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true},
                    datasetName: {type: Sequelize.STRING(256) }
                }, {
                    freezeTableName: true,
                    tableName: 'WifiDataset',

                    classMethods: {
                        onBeforeSync: function(models) {
                            models.WifiDatasetSnifferRelation.belongsTo(models.WifiDataset,
                                 { foreignKey: 'datasetId', as: 'dataset', constraints: false });
                            models.WifiDataset.hasMany(models.WifiDatasetSnifferRelation,
                                 { foreignKey: 'datasetId', as: 'deviceRelations', constraints: false });
                        },

                        onAfterSync: function(models) {
                            var tableName = this.getTableName();

                            // return Promise.join(
                            //     // create indices
                            //     SequelizeUtil.createIndexIfNotExists(tableName, ['datasetId']),
                            //     SequelizeUtil.createIndexIfNotExists(tableName, ['datasetName'])
                            // );
                        }
                    }
                });
            }
        };
    }),


    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        return {

        };
    })
});
