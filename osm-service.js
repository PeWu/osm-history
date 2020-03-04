/** Base URL for accessing OSM API. */
API_URL_BASE = 'https://api.openstreetmap.org/api/0.6/';

DEFAULT_USER_IMAGE = 'https://cdn.jsdelivr.net/gh/openstreetmap/iD@master/svg/iD-sprite/icons/icon-avatar.svg';

OsmService = function($http, $q, $rootScope) {
  this.auth = osmAuth({
    oauth_consumer_key: 'XOoeKShN1NtkKvriuBMnNsPvmBGnWQOUnovgY9fM',
    oauth_secret: '5648E77IcaiGbyVShU9g7tHfLfEllJcpsz0xvJm4',
    land: 'land.html',
    url: 'https://www.openstreetmap.org'
  });

  this.ngHttp = $http;
  this.ngQ = $q;
  this.ngRootScope = $rootScope;

  /** Converter from XML to json. */
  this.x2js = new X2JS({
    // All XML nodes under <osm> can be repeated.
    arrayAccessFormPaths: [/osm\..*/]
  });

  if (this.auth.authenticated()) {
    this.updateUserDetails();
  }
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


/** Returns a leaflet LatLng object for the given node. */
latLngFromNode = function(node) {
  return node && node._lat && node._lon && L.latLng([node._lat, node._lon]);
};


/**
 * Returns bounds for the given list of nodes.
 */
getBounds = function(nodes) {
  var bounds = L.latLngBounds();
  nodes.forEach(node => {
    bounds.extend(latLngFromNode(node));
  });
  return bounds;
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
 * Fetches an OSM path as an authenticated request.
 */
OsmService.prototype.fetchAuthenticated = function(path) {
  return this.ngQ((resolve, reject) =>
    this.auth.xhr({ method: 'GET', path: '/api/0.6/' + path },
      (err, xml) => {
        if (err || !xml) {
          reject(err || 'no xml');
        } else {
          var str = new XMLSerializer().serializeToString(xml);
          resolve({ data: str });
        }
      }
    ));
};


/**
 * Calls the given URL and returns OSM data as a list of json objects.
 * Adds a tagMap field to objects which stores a key-value map of the
 * object's tags.
 */
OsmService.prototype.fetchOsm = function(path, objectType) {
  var responsePromise =
      this.auth.authenticated() ?
      this.fetchAuthenticated(path) :
      this.ngHttp.get(API_URL_BASE + path, {headers: {'Accept': '*/*'}});

  return responsePromise.then(response => {
    var data = this.x2js.xml_str2json(response.data).osm[objectType] || [];
    data.forEach(item => {
      if (item.tag) {
        item.tagMap = tagMap(item.tag);
      }
    });
    return data;
  });
};


OsmService.prototype.updateUserDetails = function() {
  this.fetchOsm('user/details', 'user').then(response => {
    var img = response[0].img;
    var userName = response[0]._display_name;
    this.userDetails = {
      userName,
      img: (img && img[0] && img[0]._href) || DEFAULT_USER_IMAGE,
      url: 'https://www.openstreetmap.org/user/' + encodeURIComponent(userName),
    };
  });
};


OsmService.prototype.authenticated = function() {
  return this.auth.authenticated();
};


OsmService.prototype.login = function() {
  this.auth.authenticate(
      () => this.ngRootScope.$apply(
          () => this.updateUserDetails()));
};


OsmService.prototype.logout = function() {
  this.auth.logout();
};


OsmService.prototype.getUserDetails = function() {
  return this.userDetails;
}
