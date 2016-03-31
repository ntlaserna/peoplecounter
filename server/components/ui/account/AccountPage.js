/**
Copyright (c) 2015-2016, <Christopher Chin>
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
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

var NoGapDef = require('nogap').Def;

module.exports = NoGapDef.component({
    /**
     * Everything defined in `Host` lives only on the host side (here).
     * 
     */
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            Assets: {
                Files: {
                    string: {
                        template: 'AccountPage.html'
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

            Private: {
                onClientBootstrap: function() {
                },   
            },
            
            /**
             * Host commands can be directly called by the client
             */
            Public: {
                setDisplayRole: function(newRole) {
                    var user = this.Instance.User.currentUser;
                    var UserRole = Shared.User.UserRole;

                    // only staff members may set their display role
                    // NOTE: We cannot use `isStaff` here, since it checks against the `displayRole`, which might currently be demoted
                    if (!user || user.role <= UserRole.StandardUser) {
                        return Promise.reject(makeError('error.invalid.request'));
                    }
                    // one can never increase one's own role
                    else if (newRole > user.role) {
                        return Promise.reject('error.invalid.permissions');
                    }
                    else {
                        // update user values
                        return this.Instance.User.updateUserValues(user, {displayRole: newRole});
                    }
                },

                setLocale: function(newLocale) {
                    var user = this.Instance.User.currentUser;

                    if (!user) {
                        return Promise.reject(makeError('error.invalid.request'));
                    }
                    else {
                        // update user values
                        return this.Instance.User.updateUserValues(user, {locale: newLocale});
                    }
                }
            },
        };
    }),
    
    
    /**
     * Everything defined in `Client` lives only in the client.
     *
     */
    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        var ThisComponent;

        return {
            __ctor: function() {
                ThisComponent = this;
            },

            initClient: function(){
            },

            /**
             * 
             */
            setupUI: function(UIMgr, app) {
                this.allLocales = Instance.Localizer.Default.getAllLocales();
                
                // create Account controller
                app.lazyController('accountCtrl', function($scope) {
                	UIMgr.registerPageScope(ThisComponent, $scope);

                    $scope.userRole = Instance.User.currentUser.role;
                    $scope.userRoleString = Instance.User.UserRole.toString($scope.userRole);

                    $scope.clickLogout = function() {
                        $scope.busy = true;
                        
                        return ThisComponent.Instance.User.logout()
                        .finally(function() {
                            $scope.busy = false;
                        })
                        .catch($scope.handleError.bind($scope));
                    };

                    /**
                     * Change display role for staff to see the website
                     * from an average user's point of view.
                     */
                    var changeDisplayRole = function(newRole) {
                        $scope.busyRole = true;
                        ThisComponent.host.setDisplayRole(newRole)
                        .finally(function() {
                            $scope.busyRole = false;
                        })
                        .then(function() {
                            // blank the whole thing and reload
                            document.body.innerHTML = '';
                            location.reload();
                        })
                        .catch($scope.handleError.bind($scope));
                    };

                    // change to standard user display role
                    $scope.clickStandardUserDisplayRole = function() {
                        var newRole = Instance.User.UserRole.StandardUser;
                        changeDisplayRole(newRole);
                    };

                    // change back to own default role
                    $scope.clickDefaultDisplayRole = function() {
                        var newRole = Instance.User.currentUser.role;
                        changeDisplayRole(newRole);
                    };

                    $scope.setLocale = function(newLocale) {
                        $scope.busyLocale = true;
                        ThisComponent.host.setLocale(newLocale)
                        .finally(function() {
                            $scope.busyLocale = false;
                        })
                        .then(function() {
                            $scope.$apply();
                        })
                        .catch($scope.handleError.bind($scope));
                    };

                    /**
                     * Check if role was changed and update menu correspondingly.
                     */
                    $scope.updateRoleStatus = function(newRole) {
                        var roleChanged = Instance.User.currentUser.role != newRole;
                        $scope.roleChanged = roleChanged;

                        // sync button mark?
                        ThisComponent.page.navButton.setUrgentMarker(roleChanged);
                    };

                    
                    $scope.updateRoleStatus(Instance.User.currentUser.displayRole);
                });

                // register page
                Instance.UIMgr.registerPage(this, 'Account', this.assets.template, {
                    iconClasses: 'fa fa-user',
                    right: 3,
                    getText: function() {
                        var user = Instance.User.currentUser;

                        // TODO: This is a hack to update the "urgent marker" on demand...
                        ThisComponent.page.navButton && ThisComponent.page.navButton.setUrgentMarker(user && user.role != user.displayRole);

                        return user && user.userName;
                    }
                });
            },

            onPageActivate: function(args) {
                if (args && args.infoMessage) {
                    this.page.scope.infoMessage = args.infoMessage;
                }
            },
            
            /**
             * Public component methods can be directly called by the host
             */
            Public: {
                
            }
        };
    })
});
