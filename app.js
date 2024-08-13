var app = angular.module('osmHistory', ['ngRoute', 'leaflet-directive']);

/**
 * Directive for displaying one table row with a diff between 2 versions
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
      additional: '=',
      url: '@',
      context: '@',
    },
  };
};

/**
 * Directive for displaying the OSM login/logout links.
 */
LoginDirective = function() {
  return {
    templateUrl: 'osm-login.html',
    controller: 'LoginCtrl',
    controllerAs: 'ctrl',
    replace: true,
  };
};

// Configure routes.
app.config(function($routeProvider) {
  $routeProvider
    .when('/', {
      templateUrl: 'home.html',
      controller: 'HomeCtrl',
      controllerAs: 'ctrl',
    })
    .when('/:type/:id', {
      templateUrl: 'history.html',
      controller: 'HistoryCtrl',
      controllerAs: 'ctrl',
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
    // Replace numeric object ID in path with a placeholder.
    var path = $location.path().replace(/\d+/, ':id');
    $window.ga('send', 'pageview', { page: path });
  });
});

// Services.
app.service('osmService', OsmService);

// Controllers.
app.controller('HomeCtrl', HomeCtrl);
app.controller('HistoryCtrl', HistoryCtrl);
app.controller('LoginCtrl', LoginCtrl);

// Directives.
app.directive('diffRow', DiffRowDirective);
app.directive('osmLogin', LoginDirective);

// Filters.
app.filter('capitalize', () => s => s.charAt(0).toUpperCase() + s.slice(1));
