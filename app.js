var app = angular.module('osmHistory', ['ngRoute', 'leaflet-directive']);

/** Base URL for accessing OSM API. */
API_URL_BASE = 'https://api.openstreetmap.org/api/0.6/';


/**
 * For the given point, returns square bounds around it.
 */
extendBounds = function(latLng) {
  var DELTA = 0.001;
  var deltaLng = Math.asin(
    Math.sin(DELTA * Math.PI / 180) / Math.cos(latLng.lat * Math.PI / 180)) *
    180 / Math.PI;
  return L.latLngBounds(
      [latLng.lat - DELTA, latLng.lng - deltaLng],
      [latLng.lat + DELTA, latLng.lng + deltaLng]);
};


/**
 * Controller for the home page.
 */
HomeCtrl = function($rootScope, $location) {
  $rootScope.title = 'OSM history';
  this.wayId;
  this.nodeId;
  this.relationId;

  this.ngLocation = $location;
};


/**
 * Navigates to the history page.
 */
HomeCtrl.prototype.showHistory = function(type, id) {
  if (id) {
    this.ngLocation.path(`/${type}/${id}`);
  }
};


/** Returns a leaflet LatLng object for the given node. */
latLngFromNode = function(node) {
  return node && node._lat && node._lon && L.latLng([node._lat, node._lon]);
};


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
    prev: latLngFromNode(prev),
    next: latLngFromNode(next)
  }

  return {
    tags: allTagsList,
    nodeCount: nodeCount,
    memberCount: memberCount,
    coordinates: coordinates
  };
};


/**
 * Converts an array of tags from array to map.
 */
tagMap = function(tags) {
  var result = {};
  (tags || []).forEach(tag => {
    result[tag._k] = tag._v;
  });
  return result;
};


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
    $scope, $rootScope, $q, $http, $routeParams, $location, $timeout,
    leafletBoundsHelpers) {
  if (!$routeParams.id || !$routeParams.type) {
    return;
  }
  this.id = $routeParams.id;
  this.type = $routeParams.type;
  this.ngQ = $q;
  this.ngHttp = $http;
  this.ngTimeout = $timeout;
  this.leafletBoundsHelpers = leafletBoundsHelpers;

  $rootScope.title = `OSM history: ${this.type} ${this.id}`

  this.mapTiles = {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
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
    var currentObj = this.history[0].obj;
    this.deleted = currentObj._visible == 'false';
    if (this.type == 'node' && !this.deleted) {
      var latLng = latLngFromNode(currentObj);
      this.extendedBounds = extendBounds(latLng);
    }

    this.populateChangesets();

    this.populateWayHistory().then(() => this.populateWayMapData());

    this.populateMapData();
  }).catch(error => {
    this.error = error;
  });
};


/**
 * Fetches changeset data for all changes.
 * This is used to display changeset messages.
 */
HistoryCtrl.prototype.populateChangesets = function() {
  var changesets = this.history.map(entry => entry.obj._changeset);
  var url = `${API_URL_BASE}changesets?changesets=${changesets.join(',')}`;
  fetchOsm(this.ngHttp, url, 'changeset').then(changesets => {
    var changesetMap = new Map();
    changesets.forEach(cs => changesetMap.set(cs._id, cs));
    this.history.forEach(entry => {
      entry.changeset = changesetMap.get(entry.obj._changeset);
    });
  });
};


/**
 * Opens the JOSM editor with extendedBounds around the currently viewed object.
 */
HistoryCtrl.prototype.openJosm = function() {
  this.josmFailed = false;
  this.josmSuccessful = false;
  var url = 'http://localhost:8111/load_and_zoom' +
      `?left=${this.extendedBounds.getWest()}` +
      `&right=${this.extendedBounds.getEast()}` +
      `&top=${this.extendedBounds.getNorth()}` +
      `&bottom=${this.extendedBounds.getSouth()}` +
      `&select=${this.type[0]}${this.id}`;
  this.ngHttp.get(url).then(
      () => {
        this.josmSuccessful = true;
      },
      () => {
        this.josmFailed = true;
      }).then(() => {
        this.ngTimeout(() => {
          this.josmFailed = false;
          this.josmSuccessful = false;
        }, 3000);
      });
};


/**
 * Given the full history of nodes, returns the view of the given node
 * at the given changeset.
 */
getHistoricalNode = function(nodeHistory, nodeId, changeset) {
  return nodeHistory[nodeId].find(node =>
      parseInt(node._changeset) <= parseInt(changeset));
};


/**
 * Converts the given list of nodes to a list of segments (from node, to node).
 */
getSegments = function(nodes) {
  var segments = [];
  for (var i = 1; i < nodes.length; i++) {
    segments.push({from: nodes[i - 1], to: nodes[i]});
  }
  return segments;
};


/**
 * Returns lists of changed way segments based on the state of the way
 * before and after the change.
 * @param prev list of nodes before the change.
 * @param next list of nodes after the change.
 * @return 3 lists of segments (from node, to node): added, removed
 *     and unchanged.
 */
nodeListDiff = function(prev, next) {
  var prevIds = prev && prev.map(node => node._id);
  var nextIds = next && next.map(node => node._id);
  var prevIdsSet = new Set(prevIds);
  var nextIdsSet = new Set(nextIds);

  var removedIds = new Set([...prevIdsSet].filter(x => !nextIdsSet.has(x)));
  var addedIds = new Set([...nextIdsSet].filter(x => !prevIdsSet.has(x)));

  if ((!prev || prev.length < 2) && (!next || next.length < 2)) {
    return null;
  }
  if (!prev || prev.length < 2) {
    return {
      added: getSegments(next)
    }
  }
  if (!next || next.length < 2) {
    return {
      removed: getSegments(prev)
    }
  }

  var added = [];
  var removed = [];
  var unchanged = [];

  var prevIt = 0;
  var nextIt = 0;

  // Iterate over both previous and next lists of nodes and mark added,
  // removed and unchanged segments.
  while (prevIt < prev.length || nextIt < next.length) {
    var startPrev = prev[prevIt - 1];
    var startNext = next[nextIt - 1];
    var endPrev = prev[prevIt];
    var endNext = next[nextIt];
    var startSameId = startPrev && startNext && startPrev._id == startNext._id;
    var endSameId = endPrev && endNext && endPrev._id == endNext._id;
    var startEqual = (startSameId && startPrev._lat == startNext._lat &&
        startPrev._lon == startNext._lon);
    var endEqual = (endSameId && endPrev._lat == endNext._lat &&
        endPrev._lon == endNext._lon);

    if (startEqual && endEqual) {
      unchanged.push({from: startPrev, to: endPrev});
      prevIt++;
      nextIt++;
    } else {
      if (endSameId || (endPrev && removedIds.has(endPrev._id))) {
        if (startPrev) {
          removed.push({from: startPrev, to: endPrev});
        }
        prevIt++;
      }
      if (endSameId || (endNext && addedIds.has(endNext._id))) {
        if (startNext) {
          added.push({from: startNext, to: endNext});
        }
        nextIt++;
      }
      // Changed order of nodes.
      if (endPrev && endNext && !endSameId && !removedIds.has(endPrev._id) &&
          !addedIds.has(endNext._id)) {
        if (startPrev) {
          removed.push({from: startPrev, to: endPrev});
        }
        if (startNext) {
          added.push({from: startNext, to: endNext});
        }
        prevIt++;
        nextIt++;
      }
    }
  }

  return {
    added: added,
    removed: removed,
    unchanged: unchanged
  };
};


/**
 * Fetches node history for all historical nodes of a way and populates the
 * nodeListDiff for all changes. The nodeListDiff field contains lists of
 * added, removed and unchanged segments of the way.
 * Returns a promise that is resolved when all data has been populated.
 */
HistoryCtrl.prototype.populateWayHistory = function() {
  var nodes = new Set();
  this.history.forEach(change => {
    if (change.obj.nd) {
      change.obj.nd.forEach(node => nodes.add(node._ref));
    }
  });
  var nodeHistory = {};
  var nodePromises = [...nodes].map(nodeId => {
    var url = `${API_URL_BASE}node/${nodeId}/history`;
    return fetchOsm(this.ngHttp, url, 'node').then(history => {
      history.reverse();
      nodeHistory[nodeId] = history;
    });
  });
  return this.ngQ.all(nodePromises).then(() => {
    this.history.forEach(change => {
      if (change.obj.nd) {
        change.nodes = change.obj.nd.map(node =>
            getHistoricalNode(nodeHistory, node._ref, change.obj._changeset));
      }
    });

    var reverseHistory = this.history.slice(0).reverse();
    var prev = null;
    reverseHistory.forEach(change => {
      change.nodeListDiff = nodeListDiff(prev && prev.nodes, change.nodes);
      prev = change;
    });
  });
};


/** Creates a line to be drawn on a map. */
createLine = function(segment, color) {
  return {
    type: 'polyline',
    weight: 5,
    color: color,
    opacity: 0.7,
    latlngs: [latLngFromNode(segment.from), latLngFromNode(segment.to)]
  };
};


/** Adds way data to be rendered on a map for each change. */
HistoryCtrl.prototype.populateWayMapData = function() {
  this.history.forEach(change => {
    if (!change.nodeListDiff) return;
    var added = change.nodeListDiff.added || [];
    var removed = change.nodeListDiff.removed || [];
    var unchanged = change.nodeListDiff.unchanged || [];
    var allSegments = added.concat(removed).concat(unchanged);

    if (!added.length && !removed.length) return;

    var bounds = L.latLngBounds();
    allSegments.forEach(segment => {
      bounds.extend(latLngFromNode(segment.from));
      bounds.extend(latLngFromNode(segment.to));
    });

    var paths = ([]
        .concat(unchanged.map(segment => createLine(segment, '#444')))
        .concat(removed.map(segment => createLine(segment, '#a00')))
        .concat(added.map(segment => createLine(segment, '#0a0'))));

    change.mapData = {
      bounds: this.leafletBoundsHelpers.createBoundsFromLeaflet(bounds),
      paths: paths
    };
  });
};


/** Adds node data to be rendered on a map for each change. */
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
};


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
