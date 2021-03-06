/*
 * ADOBE CONFIDENTIAL
 * __________________
 *
 *  Copyright 2013 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 */

/* eslint dot-notation: 0, new-cap: 0, no-use-before-define: 0, no-undef: 0, camelcase: 0, no-shadow: 0 */

ContextHub.console.log(ContextHub.Shared.timestamp(), '[loading] contexthub.store.contexthub.maxislocation - store.basic.js');

/*
 * expected behaviour:
 * - get coordinates:
 *   - use persisted values from previous request
 *   - otherwise, ask browser for current coordinates (use default location from config property 'defaultLocation' if request fails)
 *
 * - get address information:
 *   - use persisted values from previous request
 *   - use address information (if geocoder is enabled) from 'defaultLocation' if that location is loaded
 *   - otherwise, ask reverse geocoder (if enabled) for address details of persisted coordinates (clear address info if request fails)
 *
 * - resetting store:
 *   - clears persistence
 *   - gets coordinates (see above)
 *   - gets address information (see above)
 */

(function($, window) {
    'use strict';
    /* default settings */
    var defaultConfig = {
        /* reverse geocoder configuration */
        service: {
            jsonp: false,
           timeout: 30000,
            ttl: 15 * 60 * 1000,
            // Beware: Chrome only accept secured protocol !
            secure: window.location.protocol === 'https:',
            host: 'maps.googleapis.com',
            port: 80,
            path: '/maps/api/geocode/json'
        },

        /* do not use reverse geocoder by default - it have to be enabled through store configuration */
        geocoder: {
            enabled: false
        },

        /* event defer in ms */
        eventDeferring: 16,

        /* html5 coordinates lookup settings */
        html5coordinatesDiscoveryAPI: {
            timeout: 30000,
            ttl: 15 * 60 * 1000,
            highAccuracy: false
        },

        /* signature generator url */
        signatureGenerator: ContextHub.Paths.CONTEXTHUB_PATH + '/maxisgeolocation.signature.json',

        /* initial values */
        initialValues: {
            /* default coordinates and address used as fallback in case we can't get current coordinates */
            defaultLocation: {
                /* desired fallback coordinates */
                latitude: 37.331375,
                longitude: -121.893992,

                /* address details of coordinates specified above */
                address: {
                    'country': 'United States',
                    'countryCode': 'US',
                    'city': 'San Jose',
                    'street': 'Almaden Blvd',
                    'streetNumber': '151',
                    'region': 'CA',
                    'name': '151 Almaden Blvd, San Jose, CA 95113, USA',
                    'postalCode': '95113'
                },

                /* indicates whether we need to update address details or if it matches to current coordinates */
                addressDetailsOf: {
                    latitude: 37.331375,
                    longitude: -121.893992
                }
            }
        }
    };

    /**
     * Geolocation store implementation.
     *
     * @param {String} name - store name
     * @param {Object} config - config
     * @extends ContextHub.Store.PersistedJSONPStore
     * @constructor
     */
    var MaxisBasicGeolocation = function(name, config) {
        this.config = $.extend(true, {}, defaultConfig, config);

        $.extend(this.config.service, {
            params: {
                sensor: false,
                latlng: '${contexthub:/store/' + name + '/latitude},${contexthub:/store/' + name + '/longitude}'
            }
        });

        this.init(name, this.config);

        /* is geocoder enabled? */
        this.useGeocoder = (this.config.geocoder.enabled === true) && (ContextHub.Constants.MODE === 'ui');


        /* query service */
        this.queryService(false, true);
    };

    /* performs request to geocoder to get address details */
    var resolveCurrentLocation = function(self) {
        if (self) {
            self.loadLocation({
                latitude: self.getItem('latitude'),
                longitude: self.getItem('longitude')
            });
        }
    };

    /* enables ContextHub <-> ClientContext synchronization */
    var enableDataSynchronization = function(self) {
        var triggersGeocoder = {
            'latitude': true,
            'longitude': true
        };

        /* sync ContextHub -> ClientContext */
        self.onUpdate('data-synchronization', function(event, data) {
            /* is ClientContext present? */
            if (window.ClientContext) {
                var runGeocoder = false;

                /* enable lock */
                self.synchronizationLock = true;

                $.each(data.keys.all.hash, function(key, info) {
                    var ccKey = key.replace(/^\//, '');

                    /* skip internal keys */
                    if (ccKey.indexOf('_/') === -1) {
                        ClientContext.set('geolocation/' + ccKey, info.value);
                        runGeocoder = runGeocoder || triggersGeocoder[ccKey];
                    }
                });

                /* turn off lock */
                delete self.synchronizationLock;

                /* resolve new location if requested */
                if (runGeocoder) {
                    resolveCurrentLocation(self);
                }
            }
        });

        /* sync ClientContext -> ContextHub */
        var enableContextHubSync = function(ccGeolocation) {
            /* return if ClientContext store is not present */
            if (!ccGeolocation) {
                return;
            }

            ccGeolocation.addListener('update', function(eventName, key) {
                /* infinity-loop protection (do nothing because handler was called due to ContextHub -> ClientContext synchronization) */
                if (self.synchronizationLock) {
                    return;
                }

                if (typeof key === 'string') {
                    var value = this.getProperty(key);
                    self.setItem(key, value);
                }
            });
        };

        /* perform one time ContextHub -> ClientContext initial synchronization */
        if (window.CQ_Analytics && CQ_Analytics.ClientContextMgr) {
            var fullSynchronization = function() {
                var ccGeolocation = CQ_Analytics.ClientContextMgr.getRegisteredStore('geolocation');

                if (ccGeolocation) {
                    var whitelist = { 'generatedThumbnail': true };

                    self.synchronizationLock = true;

                    /* set current keys */
                    $.each(self.getKeys(), function(idx, key) {
                        var ccKey = key.replace(/^\//, '');
                        var value = self.getItem(key);

                        if (typeof value !== 'object') {
                            whitelist[ccKey] = true;
                            ccGeolocation.setProperty(ccKey, value);
                        }
                    });

                    /* remove keys not mentioned in the whitelist */
                    $.each(ccGeolocation.getData(), function(key) {
                        if (!whitelist[key]) {
                            ccGeolocation.removeProperty(key);
                        }
                    });

                    delete self.synchronizationLock;
                }

                return ccGeolocation;
            };

            if (CQ_Analytics.ClientContextMgr.getRegisteredStore('geolocation')) {
                var ccGeolocation = fullSynchronization();
                enableContextHubSync(ccGeolocation);
            } else {
                CQ_Analytics.ClientContextMgr.addListener('storeregister', function(event, store) {
                    if (store.STORENAME === 'geolocation') {
                        var ccGeolocation = fullSynchronization();
                        enableContextHubSync(ccGeolocation);
                    }
                });
            }
        }
    };

    /* inherit from ContextHub.Store.PersistedStore */
    ContextHub.Utils.inheritance.inherit(MaxisBasicGeolocation, ContextHub.Store.PersistedJSONPStore);

    /**
     * Uses HTML5 Geolocation to get current coordinates.
     *
     * @return {$.Deferred}
     */
    MaxisBasicGeolocation.prototype.getCoordinates = function() {
        var result = $.Deferred();

        /* set rejected state if browser doesn't support geolocation */
        if (!window.navigator.geolocation) {
            return result.reject();
        }

        /* ask for current position (result.resolve or result.reject will be called) */
        window.navigator.geolocation.getCurrentPosition(result.resolve, result.reject, {
            maximumAge: this.config.html5coordinatesDiscoveryAPI.ttl,
            timeout: this.config.html5coordinatesDiscoveryAPI.timeout,
            enableHighAccuracy: this.config.html5coordinatesDiscoveryAPI.highAccuracy
        });

        return result.promise();
    };

    /**
     * Generates signature required for Google Maps API usage (updates service parameters: client, channel, signature).
     *
     * @private
     * @param {Function} onSuccess - success handler
     * @param {Function} [onFailure] - failure handler
     */
    MaxisBasicGeolocation.prototype.generateSignature = function(onSuccess, onFailure) {
        /* return if geocoder is not enabled */
        if (!this.useGeocoder) {
            return;
        }

        /* don't use reverse geocoder if UI is not displayed */


        /* are coordinates new? */
        var addressDetailsOf = this.getItem('addressDetailsOf') || {};
        var givenLatitude = this.getItem('latitude');
        var givenLongitude = this.getItem('longitude');

        /* no need to use reverse geocoder as coordinates didn't change since last request */
        if ((addressDetailsOf.latitude === givenLatitude) && (addressDetailsOf.longitude === givenLongitude)) {
            return;
        }

        /* is it a default location? copy address details without performing a query */
        var defaultLocation = this.config.initialValues.defaultLocation;

        if (defaultLocation && (givenLatitude === defaultLocation.latitude) && (givenLongitude === defaultLocation.longitude)) {
            this.setItem('address', defaultLocation.address);
            this.setItem('addressDetailsOf', defaultLocation.addressDetailsOf);
            return;
        }

        /* remove old values */
        delete this.config.service.params.client;
        delete this.config.service.params.signature;
        delete this.config.service.params.channel;

        /* get service url */
        var url = this.getServiceURL(true);

        /* remove http://host from the link */
        url = url.replace(/^https?:\/\/[^/]*/, '');

        /* generate signature */
        var self = this;

        $.ajax({
            url: this.config.signatureGenerator,
            method: 'get',
            dataType: 'json',
            cache: false,
            data: {
                url: url
            }
        }).done(function(data, textStatus, xhr) {
            if (xhr && xhr.responseJSON) {
                var params = self.config.service.params;

                /* set new parameters */
                params.client = xhr.responseJSON.client || '';
                params.channel = xhr.responseJSON.channel || '';
                params.signature = xhr.responseJSON.signature || '';

                /* execute success handler */
                onSuccess();
            } else {
                if (typeof onFailure === 'function') {
                    onFailure();
                }
            }
        }).fail(onFailure);
    };

    /**
     * Loads location based on current coordinates.
     */
    MaxisBasicGeolocation.prototype.loadCurrentLocation = function() {
        var self = this;

        $.when(this.getCoordinates())
            .then(function(response) {
                self.loadLocation(response.coords || {});
            });
    };

    /**
     * Loads given location.
     *
     * @param {Object} coordinates - coordinates
     */
    MaxisBasicGeolocation.prototype.loadLocation = function(coordinates) {
        coordinates = coordinates || {};

        // no need to queryService if the location to be loaded is the initial one
        if (defaultConfig.initialValues.latitude === coordinates.latitude &&
            defaultConfig.initialValues.longitude === coordinates.longitude) {
            return;
        }

        /* ask for coordinates and load given address */
        if ($.isNumeric(coordinates.latitude) && $.isNumeric(coordinates.longitude)) {
            this.storeLocation(coordinates, {});
            this.queryService(false, true);
        }
    };

    /**
     * Processes response from the Geocoder service.
     *
     * @param {Object} response - response
     * @return {Object}
     */
    MaxisBasicGeolocation.prototype.successHandler = function(response) {
        /* process only successful responses */
        if (response && response.status === 'OK') {
            var country = null;
            var countryCode = null;
            var city = null;
            var street = null;
            var streetNumber = null;
            var region = null;
            var postalCode = null;
            var name = null;

            var results = response['results'] || [];

            /* response contains several address descriptions, traverse it in reverse way to gather all info from less to most detailed */
            $.each(results.reverse(), function(idx1, entry) {
                entry = entry || {};

                /* address */
                name = entry['formatted_address'] || name;

                $.each(entry['address_components'] || [], function(idx2, item) {
                    var types = item['types'] || [];

                    /* area name */
                    if ($.inArray('administrative_area_level_1', types) !== -1) {
                        region = item['short_name'] || region;
                    }

                    /* country */
                    if ($.inArray('country', types) !== -1) {
                        country = item['long_name'] || country;
                        countryCode = item['short_name'] || countryCode;
                    }

                    /* locality */
                    if ($.inArray('locality', types) !== -1) {
                        city = item['short_name'] || city;
                    }

                    /* route */
                    if ($.inArray('route', types) !== -1) {
                        street = item['short_name'] || street;
                    }

                    /* street number */
                    if ($.inArray('street_number', types) !== -1) {
                        streetNumber = item['short_name'] || streetNumber;
                    }

                    /* postal code */
                    if ($.inArray('postal_code', types) !== -1) {
                        postalCode = item['short_name'] || postalCode;
                    }
                });
            });

            /* persist gathered data */
            this.setItem('address', {
                country: country || '',
                countryCode: countryCode || '',
                city: city || '',
                street: street || '',
                streetNumber: streetNumber || '',
                region: region || '',
                name: name || '',
                postalCode: postalCode || ''
            });

            this.setItem('addressDetailsOf', {
                latitude: this.getItem('latitude'),
                longitude: this.getItem('longitude')
            });
        }

        /* return response */
        return response;
    };

    /**
     * Request failure handler.
     *
     * @param {Object} error - error
     */
    MaxisBasicGeolocation.prototype.failureHandler = function(error) {
        ContextHub.console.log('Error while getting geolocation information:', error);
    };

    /**
     * Persist given location.
     *
     * @param {Object} location - location
     * @param {Object} defaults - default location
     */
    MaxisBasicGeolocation.prototype.storeLocation = function(location, defaults) {
        location = $.extend(defaults, location);

        this.setItem('latitude', parseInt(location.latitude * 1000000, 10) / 1000000);
        this.setItem('longitude', parseInt(location.longitude * 1000000, 10) / 1000000);
    };

    /**
     * Checks if there is any location currently loaded (persisted).
     *
     * @return {Boolean}
     */
    MaxisBasicGeolocation.prototype.areCoordinatesSet = function() {
        return $.isNumeric(this.getItem('latitude')) && $.isNumeric(this.getItem('longitude'));
    };

    /**
     * Custom request handler.
     *
     * @param {Boolean} reload - indicates if cache should be ignored
     * @param {Boolean} useCurrentCoordinates - indicates if persisted coordinates should be used instead of current location
     */
    MaxisBasicGeolocation.prototype.queryService = function(reload, useCurrentCoordinates) {
        var self = this;

        /* use current coordinates? */
        if (useCurrentCoordinates && !this.areCoordinatesSet()) {
            useCurrentCoordinates = false;
        }

        /* get address details */
        if (useCurrentCoordinates) {
            /* generate signature for reverse geocoder api */
            this.generateSignature(function() {
                /* details of currently persisted location */
                self.uber('queryService', reload);
            });
        } else {
            /* ask for current location and then resolve the address details */
            $.when(this.getCoordinates())
                .then(function(response) {
                    self.storeLocation(response.coords || {}, self.config.initialValues.defaultLocation);

                    /* request to reverse geocoder api */
                    self.generateSignature(function() {
                        self.uber('queryService', reload);
                    });
                }, function(error) {
                    self.failureHandler(error);

                    self.storeLocation({}, self.config.initialValues.defaultLocation);

                    /* generate signature for reverse geocoder api */
                    self.generateSignature(function() {
                        self.uber('queryService', reload);
                    });
                });
        }
    };

    /* register store candidate */
    ContextHub.Utils.storeCandidates.registerStoreCandidate(MaxisBasicGeolocation, 'contexthub.maxislocation', 30, function(store) {
        var otherImplementation = null;

        if (this.store !== store) {
            /* register this store if other implementation is not yet registered */
            otherImplementation = ContextHub.Utils.storeCandidates.getStoreFromCandidates({
                type: 'contexthub.maxislocation',
                required: true
            });
        }

        return ('geolocation' in window.navigator) && !otherImplementation;
    });

}(ContextHubJQ, window));
