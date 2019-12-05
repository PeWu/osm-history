/** Base URL for accessing OSM API. */
API_URL_BASE = 'https://api.openstreetmap.org/api/0.6/';

OsmService = function($http) {
  this.auth = osmAuth({
    oauth_consumer_key: 'XOoeKShN1NtkKvriuBMnNsPvmBGnWQOUnovgY9fM',
    oauth_secret: '5648E77IcaiGbyVShU9g7tHfLfEllJcpsz0xvJm4',
    land: 'land.html',
    url: 'https://www.openstreetmap.org'
  });

  this.ngHttp = $http;

  /** Converter from XML to json. */
  this.x2js = new X2JS({
    // All XML nodes under <osm> can be repeated.
    arrayAccessFormPaths: [/osm\..*/]
  });
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
 * Calls the given URL and returns OSM data as a list of json objects.
 * Adds a tagMap field to objects which stores a key-value map of the
 * object's tags.
 */
OsmService.prototype.fetchOsm = function(path, objectType) {
  return this.ngHttp.get(API_URL_BASE + path).then(response => {
    var data = this.x2js.xml_str2json(response.data).osm[objectType] || [];
    data.forEach(item => {
      if (item.tag) {
        item.tagMap = tagMap(item.tag);
      }
    });
    return data;
  });
};
