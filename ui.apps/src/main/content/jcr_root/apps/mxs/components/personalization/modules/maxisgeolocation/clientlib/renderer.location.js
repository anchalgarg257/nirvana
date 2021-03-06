/*
 * ADOBE CONFIDENTIAL
 * __________________
 *
 *  Copyright 2014 Adobe Systems Incorporated
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

ContextHub.console.log(ContextHub.Shared.timestamp(), '[loading] contexthub.module.contexthub.maxislocation - renderer.location.js');

(function($) {
    'use strict';

    /* predefined locations */
    var predefinedLocations = [
        { title: 'Basel, Switzerland', data: { longitude: 7.589290, latitude: 47.554746, city: 'Basel', country: 'Switzerland' } },
        { title: 'Melbourne, Australia', data: { longitude: 144.963280, latitude: -37.814107, city: 'Melbourne', country: 'Australia' } },
        { title: 'Beijing, China', data: { longitude: 116.407526, latitude: 39.904030, city: 'Beijing', country: 'China' } },
        { title: 'New York, NY, USA', data: { longitude: -74.005973, latitude: 40.714353, city: 'New York', country: 'United States' } },
        { title: 'Paris, France', data: { longitude: 2.352222, latitude: 48.856614, city: 'Paris', country: 'France' } },
        { title: 'Rio de Janeiro, Brazil', data: { longitude: -43.200710, latitude: -22.913395, city: 'Rio', country: 'Brazil' } },
        { title: 'San Jose, CA, USA', data: { longitude: -121.894955, latitude: 37.339386, city: 'San Jose', country: 'United States' } },
        { title: 'Tokyo, Japan', data: { longitude: 139.691706, latitude: 35.689487, city: 'Shinjuku', country: 'Japan' } }
    ];
    /* map url (signature generated by a request to /etc/cloudsettings/default/contexthub/geolocation.signature.json) */
    var SIGNED_MAP_URL = 'https://maps.google.com/maps/api/js?' +
        [
            'sensor=false',
            'callback=ContextHubMapsCallback',
            'client=gme-adobesystemsincorporated',
            'channel=contexthub',
            'signature=IaKKP7DLdz3vg1jMPsbLoA2LpaY='
        ].join('&');

    /* pin location */
    var selectedLatitude = null;
    var selectedLongitude = null;
    var mapHandler = null;
    var marker = null;

    /* load new location */
    var loadNewLocation = function(config, latitude, longitude) {
        var geolocation = ContextHub.getStore(config.storeMapping.g);

        if (geolocation && latitude && longitude) {
            geolocation.loadLocation({longitude: longitude, latitude: latitude});
        }
    };

    /* creates a map using google's api */
    var createLocationPicker = function(config, mapContainer, onDragEnd) {
        var google = window.google;
        var geolocation = ContextHub.getStore(config.storeMapping.g);
        var latitude = Number.parseFloat(geolocation.getItem('latitude'));
        var longitude = Number.parseFloat(geolocation.getItem('longitude'));
        var mapPosition = new google.maps.LatLng(latitude, longitude);

        /* map settings */
        var mapOptions = {
            zoom: config.mapZoom || 13,
            panControl: true,
            zoomControl: true,
            scaleControl: true,
            minZoom: 1,
            maxZoom: 15,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };

        /* set map handler */
        mapHandler = new google.maps.Map(mapContainer, mapOptions);

        /* we need to position the map in slight delay, otherwise request is ignored */
        window.setTimeout(function() {
            google.maps.event.trigger(mapHandler, 'resize');
            mapHandler.setCenter(mapPosition);
        }, 32);

        /* create a marker */
        marker = new google.maps.Marker({
            map: mapHandler,
            draggable: true,
            position: mapPosition
        });

        /* handler for moving marker */
        google.maps.event.addListener(marker, 'dragend', function() {
            /* get position of the marker */
            var point = marker.getPosition();

            /* set latitude / longitude precision */
            selectedLatitude = parseInt(point.lat() * 1000000, 10) / 1000000;
            selectedLongitude = parseInt(point.lng() * 1000000, 10) / 1000000;

            /* limit latitude: -85 .. 85, longitude: -180 .. 180 */
            selectedLatitude = Math.min(Math.max(-85, selectedLatitude), 85);
            selectedLongitude = Math.min(Math.max(-180, selectedLongitude), 180);

            /* apply changes */
            if (typeof onDragEnd === 'function') {
                onDragEnd(config, selectedLatitude, selectedLongitude);
            }
        });

        /* handler for changing zoom */
        mapHandler.addListener('zoom_changed', function() {
            config.mapZoom = mapHandler.getZoom();
        });
    };

    var geolocationStore = ContextHub.getStore('maxisgeolocation');
    var moduleTemplate = '<p>{{i18n "Location"}}</p><p>{{g.latitude}}, {{g.longitude}}</p>';
    /* change the module template if geocoder is enabled */
    if (geolocationStore && (geolocationStore.useGeocoder === true)) {
        moduleTemplate =
            '<p>{{i18n "Location"}}</p>' +
            '<p>{{g.address.postalCode}} {{g.address.city}}' +
            '{{#if g.address.city}}{{#if g.address.region}},{{/if}}{{/if}} {{g.address.region}}</p>';
    }

    /* Location renderer */
    var MaxisLocationRenderer = function() {};

    /* inherit from ContextHub.UI.BaseModuleRenderer */
    ContextHub.Utils.inheritance.inherit(MaxisLocationRenderer, ContextHub.UI.BaseModuleRenderer);

    /* default config */
    MaxisLocationRenderer.prototype.defaultConfig = {
        icon: 'coral-Icon--compass',
        title: 'Location',
        clickable: true,
        editable: {
            key: '/maxisgeolocation',

            /* list of disabled properties */
            disabled: [
            ],

            /* list of hidden properties */
            hidden: [
                '/maxisgeolocation/generatedThumbnail',
                '/maxisgeolocation/city',
                '/maxisgeolocation/country',
                '/maxisgeolocation/defaultLocation/*',
                '/maxisgeolocation/addressDetailsOf/*'
            ]
        },
        fullscreen: true,
        storeMapping: {
            g: 'maxisgeolocation'
        },
        template: moduleTemplate,
        list: predefinedLocations,
        listType: 'checkmark'
    };

    /* fullscreen handler */
    MaxisLocationRenderer.prototype.onFullscreenClicked = function(module) {
        var config = $.extend({}, this.defaultConfig, module.config);

        /* create a fullscreen container */
        var id = 'fullscreen-geolocation';
        $('#' + id).remove();

        /* create buttons */
        var cancelButton = $('<i/>').addClass('coral-Icon coral-Icon--close coral-Icon--sizeS u-coral-pullRight').attr('title', 'Cancel');
        var confirmButton = $('<i/>').addClass('coral-Icon coral-Icon--check coral-Icon--sizeS u-coral-pullRight').attr('title', 'Confirm');

        /* create title */
        var titleBar = $('<nav/>')
            .addClass('coral-Wizard-nav coral--dark contexthub-fullscreen-toolbar')
            .append(
            $('<span class="u-coral-pullLeft title"/>').text('Change Location'),
            confirmButton,
            cancelButton
        );

        /* create page body */
        var pageBody = $('body');
        var calcPrefix = /webkit/.test(window.navigator.userAgent.toLowerCase()) ? '-webkit-' : '';

        /* create map container */
        var mapContainer = $('<div/>')
            .addClass('map')
            .css('height', calcPrefix + 'calc(100% - 38px)')
            .append($('<div/>').addClass('coral-Wait coral-Wait--center coral-Wait--large'));

        /* create page container */
        var container = $('<div/>')
            .addClass('contexthub-fullscreen fade-out')
            .attr('id', id)
            .append(
            titleBar,
            mapContainer
        );

        /* fade-in */
        window.setTimeout(function() {
            container.removeClass('fade-out');
        }, 16 * 3);

        ContextHub.UI.Container.fullscreen(true);
        pageBody.addClass('keep-full-screen');
        container.prependTo(pageBody);

        /* cancel */
        cancelButton.on('click', function() {
            container.addClass('fade-out');

            /* turn off fullscreen once transition is done */
            window.setTimeout(function() {
                container.remove();
                ContextHub.UI.Container.fullscreen(false);
                pageBody.removeClass('keep-full-screen');
            }, 300);
        });

        /* confirm new location */
        confirmButton.on('click', function() {
            loadNewLocation(config, selectedLatitude, selectedLongitude);
            container.addClass('fade-out');

            /* turn off fullscreen once transition is done */
            window.setTimeout(function() {
                container.remove();
                ContextHub.UI.Container.fullscreen(false);
                pageBody.removeClass('keep-full-screen');
            }, 300);
        });

        if (window.google) {
            createLocationPicker(config, mapContainer[0]);
        } else {
            window.ContextHubMapsCallback = function() { return createLocationPicker.apply(null, [ config, mapContainer[0]]); };
            $.getScript(SIGNED_MAP_URL);
        }
    };

    /* Item click handler */
    MaxisLocationRenderer.prototype.onListItemClicked = function(module, position, data) {
        var config = $.extend({}, this.defaultConfig, module.config);
        var geolocation = ContextHub.getStore(config.storeMapping.g);

        /* load new location */
        if (geolocation && data.longitude && data.latitude) {
            geolocation.loadLocation(data);
        }
    };

    /* Popover content generator */
    MaxisLocationRenderer.prototype.getPopoverContent = function(module, popoverVariant) {
        var config = $.extend({}, this.defaultConfig, module.config);

        /* presentation mode */
        if (!popoverVariant || popoverVariant === 'default') {
            config.list = predefinedLocations;
            config.listType = 'checkmark';

            if (config.list && config.storeMapping && config.storeMapping.g) {
                var store = ContextHub.getStore(config.storeMapping.g);

                if (store) {
                    var city = store.getItem('address/city');
                    var country = store.getItem('address/country');
                    var longitude = String(store.getItem('longitude') || '').substring(0, 5);
                    var latitude = String(store.getItem('latitude') || '').substring(0, 5);

                    /* check if selected location is same as one of the items on the list */
                    $.each(config.list, function(i, item) {
                        var sameCity = (item.data.city === city && item.data.country === country);
                        var sameLocation =
                            (String(item.data.longitude).substring(0, 5) === longitude) &&
                            (String(item.data.latitude).substring(0, 5) === latitude);

                        item.selected = sameCity || sameLocation;
                    });
                }
            }
        }

        /* edition mode */
        if (popoverVariant === 'module-editing') {
            var list = this.prepareGenericList(config.editable.key, config);

            config.listType = 'input';
            config.list = list;
        }

        module.config = config;

        /* get the popover content */
        var popoverContent = this.uber('getPopoverContent', module);

        /* prepend map to the popover */
        if (popoverVariant === 'module-editing') {
            /* add map if it's not there yet */
            if ($('.contexthub-popover .map.do-not-update').length === 0) {
                var map = $('<div/>')
                    .addClass('map do-not-update')
                    .append($('<div/>').addClass('coral-Wait coral-Wait--center coral-Wait--large'));
                popoverContent = $('<div/>').append(map).append(popoverContent).contents();

                /* prepare location picker */
                if (window.google) {
                    createLocationPicker(config, map[0], loadNewLocation);
                } else {
                    window.ContextHubMapsCallback = function() {
                        return createLocationPicker.apply(null, [ config, map[0], loadNewLocation]);
                    };

                    /* load google maps, a callback function will be called once it's done */
                    $.getScript(SIGNED_MAP_URL);
                }
            } else {
                /* move map and marker to a new position */
                if (mapHandler && marker) {
                    var geolocation = ContextHub.getStore(config.storeMapping.g);
                    var newLatitude = Number.parseFloat(geolocation.getItem('latitude'));
                    var newLongitude = Number.parseFloat(geolocation.getItem('longitude'));
                    var newPosition = new window.google.maps.LatLng(newLatitude, newLongitude);
                    mapHandler.panTo(newPosition);
                    marker.setPosition(newPosition);
                }
            }
        }

        return popoverContent;
    };

    /* Location editing handler */
    MaxisLocationRenderer.prototype.handleInputBlur = function(event) {
        var input = $(event.currentTarget);
        var property = input.attr('data-persistence-key');
        var longitudeKey = '/store/maxisgeolocation/longitude';
        var latitudeKey = '/store/maxisgeolocation/latitude';
        var coordinatesKeys = {};

        coordinatesKeys[longitudeKey] = true;
        coordinatesKeys[latitudeKey] = true;

        /* if modified property is either longitude or latitude */
        if (coordinatesKeys[property]) {
            var givenLatitude = ContextHub.getItem(latitudeKey);
            var givenLongitude = ContextHub.getItem(longitudeKey);
            var value = input.val();

            /* setting value precision */
            var currentValue = parseInt(value * 1000000, 10) / 1000000;
            var previousValue = parseFloat(input.attr('data-previous-value')) || 0;

            /* limit latitude: -85 .. 85 */
            if (property === latitudeKey) {
                currentValue = Math.min(Math.max(-85, currentValue), 85);
            }

            /* limit longitude: -180 .. 180 */
            if (property === longitudeKey) {
                currentValue = Math.min(Math.max(-180, currentValue), 180);
            }

            /* trim the value and set back previous value if current is not a number */
            currentValue = isNaN(currentValue) ? previousValue : currentValue;
            input.val(currentValue);

            /* load new location */
            if (property === latitudeKey) {
                givenLatitude = currentValue;
            }

            if (property === longitudeKey) {
                givenLongitude = currentValue;
            }

            loadNewLocation(this.defaultConfig, givenLatitude, givenLongitude);
        }

        /* call original handler */
        this.uber('handleInputBlur', event);
    };

    /* register module */
    ContextHub.UI.ModuleRenderer('contexthub.maxislocation', new MaxisLocationRenderer());

}(ContextHubJQ));
