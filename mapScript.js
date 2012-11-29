
// global vars to hold file data after it's lodaded to avoid reloading
var points, morePoints;

// slutty global vars with attributes that everyone has free access to
var map, elevHeatmap;

// global holder object
var atlas = {};

// constants, sort of
// order is [cold, medium, hot]
atlas.ORIGINAL = [
	'rgba(0, 255, 255, 0)',
	'rgba(0, 255, 255, 1)',
	'rgba(0, 191, 255, 1)',
	'rgba(0, 127, 255, 1)',
	'rgba(0, 63, 255, 1)',
	'rgba(0, 0, 255, 1)',
	'rgba(0, 0, 223, 1)',
	'rgba(0, 0, 191, 1)',
	'rgba(0, 0, 159, 1)',
	'rgba(0, 0, 127, 1)',
	'rgba(63, 0, 91, 1)',
	'rgba(127, 0, 63, 1)',
	'rgba(191, 0, 31, 1)',
	'rgba(255, 0, 0, 1)'
];
atlas.MODIFIED = [
	'rgba(0, 255, 0, 0)',
	'rgba(0, 255, 0, 1)',
	'rgba(255, 255, 0, 1)',
	'rgba(255, 0, 0, 1)',
	'rgba(0, 0, 255, 1)',
	'rgba(255, 255, 255, 1)',
];

// can change density for more accuracy but may hit Google elevation API limits
// changing density requires changing radius of influence as well
atlas.DENSITY = 31; // 31 gives a nice round 1024 total points
atlas.TOTALSTEPS = 6; // how many pieces to break up the request into

google.maps.event.addDomListener(window, 'load', initialize)

function initialize() {
	var sanFran = new google.maps.LatLng(37.755, -122.436);
	var mapOptions = {
		center: sanFran,
		zoom: 13,
		mapTypeId: google.maps.MapTypeId.ROADMAP,
		disableDefaultUI: false,
		scaleControl: true,
		zoomControl: true,
		panControl: false,
		streetViewControl: false,
		zoomControlOptions: {
			style: google.maps.ZoomControlStyle.SMALL,
		}
	};
	
	// creating a map referencing the DOM automatically inserts it at that point
    map = new google.maps.Map($('#map_canvas')[0], mapOptions);

	// set up for toggling data source, gradient colors, and heatmap itself
	map.liveData = false;
	$('#update_live_data').hide(); // hide 'Update Live Data' button
	map.heatmap = true;
	map.gradient = 0;

	google.maps.event.addListener(map, 'idle', mapBecomesIdle);
	
} // end initialize

// ---------------------------------------------------------------------
// - main methods for displaying and updating heatmap layer on the map -
// ---------------------------------------------------------------------

function mapBecomesIdle() {
	// with static map data enabled, heatmap updates upon every pan or zoom
	if (!map.liveData && map.heatmap) showStaticElevations();
}

function showElevations() {
	map.liveData ? showLiveElevations() : showStaticElevations();
}

// pull elevation data from file and display it on map
function showStaticElevations() {
	var viewHeater = new Heater(map);

	if (!points) points = preProcess(loadFile('elevations.txt')); 
	viewHeater.addRelevantPoints(points);

	// load additional data at zoom 15 and above
	if (map.getZoom() >= 15) { 
		if (!morePoints) morePoints = preProcess(loadFile('elevations3.txt'));
		viewHeater.addRelevantPoints(morePoints);
	}

	viewHeater.showNewHeatmap();
} 

// fetch elevation data from Google API and display it on map
function showLiveElevations() {
	var viewHeater = new Heater(map);

	viewHeater.addLocationsInView();
	
	viewHeater.recursiveElevGetter(0);
} 

// -----------------------------------
// - the all-important Heater object -
// -----------------------------------

// Heater gathers data relevant to a heatmap, puts data in form necessary 
// for Google elevation API, and displays heatmap layer on the map
// function Heater(map) {
var Heater = function(map) {
	var currBounds = map.getBounds();
	this.top = currBounds.getNorthEast().lat();
	this.bottom = currBounds.getSouthWest().lat();
	this.left = currBounds.getSouthWest().lng();
	this.right = currBounds.getNorthEast().lng();
	
	// create margin beyond view window to avoid edge distorton
	var extra = .03;
	this.topper = this.top + (this.top - this.bottom) * extra;
	this.bottomer = this.bottom - (this.top - this.bottom) * extra;
	this.lefter = this.left - (this.right - this.left) * extra;
	this.righter = this.right + (this.right - this.left) * extra;
	
	this.height = $('#map_canvas').height();
	this.width = $('#map_canvas').width();
	
	this.maxElevation = -Infinity;
	this.minElevation = Infinity;
	
	this.landLocations = [];
	this.landElevations = [];
	this.locationsInView = [];
	this.heatmapElevData = [];
}

// for showing live elvation
Heater.prototype.addLocationsInView = function() {
	var longs = this.right - this.left;
	var lats = this.top - this.bottom;
	
	// keeps our grid of points evenly-spaced
	var factor = (longs / lats) / (this.width / this.height); 
	
	// calc for non-square view window
	if (this.width > this.height) {
		var lngIncrement = longs / atlas.DENSITY;
		var latIncrement = lngIncrement / factor;
	} else {
		var latIncrement = lats / atlas.DENSITY;
		var lngIncrement = latIncrement * factor;
	}

	for (var currLat = this.top; 
			 currLat > this.bottom - latIncrement / 2; // to make sure we get exact number of points
		 	 currLat -= latIncrement) {
		for (var currLng = this.left; 
				 currLng < this.right + lngIncrement / 2; 
			 	 currLng += lngIncrement) {
			this.locationsInView.push(new google.maps.LatLng(currLat, currLng));
		}
	}
}

// breaks up request for data from Google into pieces to avoid hitting quota
Heater.prototype.recursiveElevGetter = function(step) {
	elevator = new google.maps.ElevationService();

	var requestLocations = this.getSliceOfLocations(step);
	var positionalRequest = { 'locations': requestLocations }
	
	elevator.getElevationForLocations(positionalRequest, function(results, status) {
		if (status != google.maps.ElevationStatus.OK) {
			// something went wrong with the elevation request
			$('#elev_info').html(status);
		} else {
			
			// update cookie that watches for quota-busting
			if ($.cookie('requests')) {
				$.cookie('requests', (parseInt($.cookie('requests')) + requestLocations.length));
			} else {
				$.cookie('requests', requestLocations.length, { expires: 1 } );
			}

			// show progress so user doesn't think it's frozen
			this.showProgress(step);
				
			// add points that are on land
			for (var i = 0; i < results.length; i++) {
				if (results[i].elevation > 0) { 
					this.addPoint(requestLocations[i], results[i].elevation);
				}
			}

			if (step == atlas.TOTALSTEPS - 1) {
				// base case for recursion; we have all the data so we make the map
				this.showNewHeatmap();
			} else {
				// recursive call to get next batch of data
				this.recursiveElevGetter(step + 1)
			}
		}
	}.bind(this));
}

// for showing static elevation
Heater.prototype.addRelevantPoints = function(points) {
	for (var i = 0; i < points.length-1; i++) {
		
		// add point if it's in view (plus margin)
		if (points[i]['lat'] > this.bottomer 	&& points[i]['lat'] < this.topper && 
			points[i]['lng'] > this.lefter	 	&& points[i]['lng'] < this.righter) { 

			this.landLocations.push(new google.maps.LatLng(points[i]['lat'], points[i]['lng']));
			this.landElevations.push(points[i]['ele']);

			// update elevation bounds if point actually in view
			if (points[i]['lat'] > this.bottom 	&& points[i]['lat'] < this.top && 
				points[i]['lng'] > this.left	&& points[i]['lng'] < this.right) {
				this.updateMaxMin(points[i]['ele']);
			}
		}
	}
}

// used for both static and live
Heater.prototype.showNewHeatmap = function() {

	// remove old heatmap layer before adding the new one
	if (elevHeatmap) elevHeatmap.setMap(null); 

	// create array of weighted points
	this.makeHeatmapElevData();

	// create Google object 'MVCArray' from the weighted points array
	var heatmapElevArray = new google.maps.MVCArray(this.heatmapElevData);
	
	// create heatmap layer
	elevHeatmap = new google.maps.visualization.HeatmapLayer({
	    data: heatmapElevArray,
		opacity: .6,
		maxIntensity: 2,
		dissipating: true,
		radius: influenceByZoomLevel(map.getZoom()),
		gradient: gradient(map.gradient) 
    });

	// add heatmap layer to the map
    elevHeatmap.setMap(map);
	map.heatmap = true;

	updateInfo(this);
}

// create array of weighted points using landLocations and landElevations
Heater.prototype.makeHeatmapElevData = function() {
	
	for (var i = 0; i < this.landLocations.length; i++) {
		
		// don't want to show elevations out of range (may exist in the margin)
		var elevInRange;
		
		if (this.landElevations[i] > this.maxElevation) { 
			elevInRange = this.maxElevation; 
		} else if (this.landElevations[i] <= this.minElevation) { 
			elevInRange = this.minElevation * 1.0001; // avoid numerator == 0
		} else { 
			elevInRange = this.landElevations[i]; 
		}
		
		this.heatmapElevData.push({ 
			location: this.landLocations[i], 
			weight: ((elevInRange - this.minElevation) / 
				(this.maxElevation - this.minElevation)) 
		});
	}
}

// ---------------------------------------------------------
// - a few little helper instance methods of Heater object -
// ---------------------------------------------------------

Heater.prototype.updateMaxMin = function(elev) {
	this.maxElevation = Math.max(this.maxElevation, elev);
	this.minElevation = Math.min(this.minElevation, elev);
}

Heater.prototype.getSliceOfLocations = function(step) {
	return this.locationsInView.slice(
		this.locationsInView.length * (step / atlas.TOTALSTEPS), 
		this.locationsInView.length * ((step + 1) / atlas.TOTALSTEPS)
	);
}

Heater.prototype.addPoint = function(location, elevation) {
	this.landLocations.push(location);
	this.landElevations.push(elevation);
	this.updateMaxMin(elevation);
}

Heater.prototype.showProgress = function(step) {
	$('#alert_info').html("<div id='alert_live_info'><strong>Loading data... " + 
		(this.locationsInView.length * (step / atlas.TOTALSTEPS)).toFixed(0) + 
		"/" + this.locationsInView.length + "</div>");
}

Heater.prototype.updateInsideInfo = function() {
	if (this.heatmapElevData.length > 0) {
		$("#elev_info").html('Highest elevation: ' + 
			Math.round(this.maxElevation) + 
			' meters <br>Lowest elevation: ' + 
			Math.round(this.minElevation) + 
			' meters');
		$("#elev_info").append('<br>Heatmap created using ' + 
			this.heatmapElevData.length + ' points of data');
	} else {
		$("#elev_info").html('No static data available for this view.<br>Try switching to live data or returning to San Francisco.');
	}
		$('#elev_info').append('<br>color scheme: ' + map.gradient);
}
	
// ---------------------------------------
// - a few little general helper methods -
// ---------------------------------------

function updateInfo(viewHeater) {

	// show info about current heatmap
	if (!viewHeater) {
		$('#elev_info').html('Heatmap turned off');
	} else {
		viewHeater.updateInsideInfo();
	}

	// show current zoom level
	$("#elev_info").append('<br>Zoom level: ' + map.getZoom());
	
	// alert messages
	if (map.liveData) {
		var requests = $.cookie('requests');
		$("#alert_info").html("<div id='alert_live_info'><strong>¡Cuidado!</strong> Live data is subject to quotas set by the Google elevation API<br>You have currently used <strong>" + requests + "</strong> of your allowed <strong>25,000</strong> requests per day.<br>For more information, see \"Why is Live Data Problematic?\" below.</div>");
	} else {
		if (map.getZoom() > 16 || map.getZoom() < 12) {
			$("#alert_info").html("<div id='alert_live_info'>Static data only really works between zoom levels 12 and 16.<br>Try zooming in or out or switching to live data.</div>");
		} else {
			$("#alert_info").html("");			
		}
	}
}

function loadFile(filename) {
	var returned = [];
	
	$.ajax({
		url: filename,
		async: false,
		success: function(result) {
			returned = result.split("\n");
		}
	});
	
	return returned;
}

function preProcess(lines) {
	var points = lines.map(function(line) {
		var components = line.split(" ");
		
		return {
			lat: components[0],
			lng: components[1],
			ele: components[2]
		};
	});

	// eliminate points under water (i.e. with elevation <= 0)
	return points.filter(function(p) {
		return p.ele > 0;
	});
}

function influenceByZoomLevel(zoom) {
	if (map.liveData) return 40;
	
	if (zoom >= 17) return 110;
	if (zoom >= 16) return 80; 
	if (zoom >= 15) return 40; // additional data loaded at zoom 15 as well
	if (zoom >= 14) return 30;
	if (zoom >= 13) return 15;
	return 10;
}

function gradient(number) {
	switch (number) {
		case 0:
			return atlas.MODIFIED;
		case 1:
			return atlas.ORIGINAL;
		case 2:
			return null;
	}
}

function changeGradient() {
	map.gradient = (map.gradient + 1) % 3;

	elevHeatmap.setOptions({
	    gradient: gradient(map.gradient)
	});
}

function toggleHeatmap() {
	map.heatmap = !map.heatmap;
	if (map.heatmap) {
		showElevations();
	} else {
		elevHeatmap.setMap(null);
		updateInfo(null);
	}
}

function switchDataSource() {
	map.liveData = !map.liveData;
	if (map.liveData) {
		$('#update_live_data').show();
		$('#switch_data_source').html("Use Static Data");
	} else {
		$('#update_live_data').hide();
		$('#switch_data_source').html("Switch to Live Data");
	}
	showElevations();
}
