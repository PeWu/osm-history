var app = angular.module('osmHistory', ['ngRoute', 'leaflet-directive']);

/** Base URL for accessing OSM API. */
API_URL_BASE = 'https://api.openstreetmap.org/api/0.6/'


/**
 * Controller for the home page.
 */
HomeCtrl = function($location) {
  this.wayId;
  this.nodeId;
  this.relationId;

  this.ngLocation = $location;
}


/**
 * Navigates to the history page.
 */
HomeCtrl.prototype.showHistory = function(type, id) {
  if (id) {
    this.ngLocation.path(`/${type}/${id}`);
  }
}


/**
 * Returns a list of tags with previous and next values.
 * A previous or next value is undefined if it doesn't exist.
 */
tagsDiff = function(prev, next) {
  var allTags = new Map();

  if (prev && prev.tag) {
    prev.tag.forEach(tag => allTags.set(tag._k, {prev: tag._v}));
  }
  if (next.tag) {
    next.tag.forEach(tag => {
      var entry = allTags.get(tag._k);
      if (!entry) {
        entry = {};
        allTags.set(tag._k, entry);
      }
      entry.next = tag._v;
    });
  }
  return [...allTags].sort().map(entry => {
    var prev = entry[1].prev;
    var next = entry[1].next;
    return {
      key: entry[0],
      prev: prev,
      next: next
    }
  });
};


/**
 * Returns an object containing differences between the previous and next
 * versions of an object.
 */
objDiff = function(prev, next) {
  var allTagsList = tagsDiff(prev, next);
  var nodeCount = {
    prev: prev && prev.nd && prev.nd.length,
    next: next.nd && next.nd.length
  }
  var memberCount = {
    prev: prev && prev.member && prev.member.length,
    next: next.member && next.member.length
  }
  var coordinates = {
    prev: prev && prev._lat && L.latLng([prev._lat, prev._lon]),
    next: next && next._lat && L.latLng([next._lat, next._lon])
  }

  return {
    tags: allTagsList,
    nodeCount: nodeCount,
    memberCount: memberCount,
    coordinates: coordinates
  };
}


/**
 * Converts an array of tags from array to map.
 */
tagMap = function(tags) {
  var result = {};
  (tags || []).forEach(tag => {
    result[tag._k] = tag._v;
  });
  return result;
}


/**
 * Converter from XML to json.
 */
var x2js = new X2JS({
  // All XML nodes under <osm> can be repeated.
  arrayAccessFormPaths: [/osm\..*/]
});


/**
 * Calls the given URL and returns OSM data as a list of json objects.
 * Adds a tagMap field to objects which stores a key-value map of the
 * object's tags.
 */
fetchOsm = function($http, url, objectType) {
  return $http.get(url).then(response => {
    var data = x2js.xml_str2json(response.data).osm[objectType];
    data.forEach(item => {
      if (item.tag) {
        item.tagMap = tagMap(item.tag);
      }
    });
    return data;
  });
};


/**
 * Controller for the history pages (way, node, relation).
 */
HistoryCtrl = function(
    $scope, $http, $routeParams, $location, leafletBoundsHelpers) {
  if (!$routeParams.id || !$routeParams.type) {
    return;
  }
  this.id = $routeParams.id;
  this.type = $routeParams.type;
  this.leafletBoundsHelpers = leafletBoundsHelpers;

  this.mapTiles = {
    url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19
    }
  };

  var url = `${API_URL_BASE}${this.type}/${this.id}/history`;
  fetchOsm($http, url, this.type).then(history => {
    var prev = null;
    this.history = history.map(obj => {
      var diff = objDiff(prev, obj);
      prev = obj;
      return {
        obj: obj,
        diff: diff
      };
    });
    this.history.reverse();  // Start with the newest change.

    this.populateMapData();

    // Fetch changeset data for all changes to display the changeset message.
    var changesets = this.history.map(entry => entry.obj._changeset);
    var url = `${API_URL_BASE}changesets?changesets=${changesets.join(',')}`;
    fetchOsm($http, url, 'changeset').then(changesets => {
      var changesetMap = new Map();
      changesets.forEach(cs => changesetMap.set(cs._id, cs));
      this.history.forEach(entry => {
        entry.changeset = changesetMap.get(entry.obj._changeset);
      });
    });
  }).catch(error => {
    this.error = error;
  });
};


/** Adds data to be rendered on a map for each change. */
HistoryCtrl.prototype.populateMapData = function() {
  this.history.forEach(change => {
    var prev = change.diff.coordinates.prev;
    var next = change.diff.coordinates.next;
    if ((!prev && !next) || (prev && prev.equals(next))) return;

    var bounds = L.latLngBounds();
    bounds.extend(prev);
    bounds.extend(next);
    change.mapData = {
      bounds: this.leafletBoundsHelpers.createBoundsFromLeaflet(bounds),
      paths: {}
    };
    if (prev) {
      change.mapData.paths.prev = {
        type: 'circleMarker',
        radius: 5,
        weight: 3,
        color: '#a00',
        latlngs: prev
      };
    }
    if (next) {
      change.mapData.paths.next = {
        type: 'circleMarker',
        radius: 5,
        weight: 3,
        color: '#0a0',
        latlngs: next
      };
    }
  });
}


/**
 * Formats the coordinates as string.
 */
HistoryCtrl.prototype.formatCoords = function(coords) {
  return coords && `${coords.lat}, ${coords.lng}`;
};


/**
 * Directive for displaying one table row with a diff between 2 varsions
 * of a tag.
 */
DiffRowDirective = function() {
  return {
    templateUrl: 'diff-row.html',
    replace: true,
    scope: {
      key: '@',
      prev: '=',
      next: '=',
    }
  };
};

// Configure routes.
app.config(function($routeProvider) {
  $routeProvider
      .when('/', {
        templateUrl: 'home.html',
        controller: 'HomeCtrl',
        controllerAs: 'ctrl'
      })
      .when('/:type/:id', {
        templateUrl: 'history.html',
        controller: 'HistoryCtrl',
        controllerAs: 'ctrl'
      });
});

// Disable debug logs.
app.config(function($logProvider) {
  $logProvider.debugEnabled(false);
});

// Configure Analytics.
app.run(function($rootScope, $location, $window) {
  $rootScope.$on('$routeChangeSuccess', event => {
    if (!$window.ga) {
      return;
    }
    $window.ga('send', 'pageview', {page: $location.path()});
  });
});

// Controllers.
app.controller('HomeCtrl', HomeCtrl);
app.controller('HistoryCtrl', HistoryCtrl);

// Directives.
app.directive('diffRow', DiffRowDirective);

// Filters.
app.filter('capitalize', () => s => s.charAt(0).toUpperCase() + s.slice(1));
