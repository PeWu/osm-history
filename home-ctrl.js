/**
 * Controller for the home page.
 */
HomeCtrl = function($rootScope, $location, $window, osmService) {
  $rootScope.title = 'OSM history';
  this.wayId;
  this.nodeId;
  this.relationId;

  this.ngLocation = $location;
  this.ngWindow = $window;
  this.osmService = osmService;
};

/**
 * Navigates to the history page.
 */
HomeCtrl.prototype.showHistory = function(type, id) {
  if (id) {
    this.ngLocation.path(`/${type}/${id}`);
  }
};

/**
 * Navigates to the history page of a random object of the given type.
 * Sends 5 requests to get a random object in parallel. If an object with at
 * least 3 versions is found, its history is shown. Otherwise any other
 * object that actually exists is shown. If all requests fail, the history of
 * one of hard-coded objects is shown.
 */
HomeCtrl.prototype.randomize = function(type) {
  if (this.ngWindow.ga) {
    this.ngWindow.ga('send', 'event', 'random', type);
  }
  // Max ID for random generation.
  var MAX_ID = {
    node: 1000000000,
    way: 400000000,
    relation: 1000000,
  };
  // If all fails, fall back to one of these objects.
  var DEFAULT_ID = {
    node: 1804402734,
    way: 26129870,
    relation: 2308603,
  };
  var maybeShow = null;
  var receivedCount = 0;
  var done = false;

  // Number of random requests to make to find a good object.
  var NUM_TRIES = 5;

  for (var i = 0; i < NUM_TRIES; i++) {
    var id = Math.floor(Math.random() * MAX_ID[type]) + 1;
    this.osmService
      .fetchOsm(`${type}/${id}`, type)
      .then(obj => {
        if (done) {
          // Already navigated.
          return;
        }
        if (parseInt(obj[0]._version) >= 3) {
          // Navigating to object with at least 3 versions.
          this.showHistory(type, obj[0]._id);
          done = true;
        } else {
          // Found object with less than 3 versions. If nothing better is found,
          // use this one.
          maybeShow = obj[0]._id;
        }
      })
      .finally(() => {
        receivedCount++;
        if (!done && receivedCount == NUM_TRIES) {
          // All requests finished but no good object was found.
          if (maybeShow) {
            // Navigate to object with small history.
            this.showHistory(type, maybeShow);
          } else {
            // Navigate to default object because all random tries have failed.
            this.showHistory(type, DEFAULT_ID[type]);
          }
        }
      });
  }
};
