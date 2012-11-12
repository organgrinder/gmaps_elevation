
// global vars to hold files once they are lodaded to avoid reloading them
var lines, moreLines;

// slutty global vars with attributes that everyone has free access to
var map, elevHeatmap;

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

	// set up for toggling heatmap and data source
	map.liveData = false;
	$('#update_live_data').hide(); // hide 'Update Live Data' button
	map.heatmap = true;

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
	var viewHeater = new heater(map);

	if (!lines) lines = loadFile('elevations.txt'); 
	viewHeater.addRelevantLines(lines);

	// load additional data at zoom 15 and above
	if (map.getZoom() >= 15) { 
		if (!moreLines) moreLines = loadFile('elevations3.txt'); 
		viewHeater.addRelevantLines(moreLines);
	}

	viewHeater.showNewHeatmap();
} 

// fetch elevation data from Google API and display it on map
function showLiveElevations() {
	var viewHeater = new heater(map);

	// can change density for more accuracy but may hit Google elevation API limits
	// changing density requires changing radius of influence as well
	var density = 31; // 31 gives a nice round 1024 total points
	var totalSteps = 6; // how many pieces to break up the request into
	
	viewHeater.addLocationsInView(density);
	
	recursiveElevGetter(viewHeater, 1, totalSteps)
} 

// breaks up request for data from Google into pieces to avoid hitting quota
function recursiveElevGetter(viewHeater, step, totalSteps) {
	elevator = new google.maps.ElevationService();

	var requestLocations = viewHeater.getSliceOfLocations(step, totalSteps);
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
			viewHeater.showProgress(step, totalSteps);
				
			// add points that are on land
			for (var i = 0; i < results.length; i++) {
				if (results[i].elevation > 0) { 
					viewHeater.addPoint(requestLocations[i], results[i].elevation);
				}
			}

			if (step == totalSteps) {
				// base case for recursion; we have all the data so we make the map
				viewHeater.showNewHeatmap();
			} else {
				// recursive call to get next batch of data
				recursiveElevGetter(viewHeater, step + 1, totalSteps)
			}
		}
	});
}

// -----------------------------------
// - the all-important heater object -
// -----------------------------------

// heater gathers data relevant to a heatmap, puts data in form necessary 
// for Google elevation API, and displays heatmap layer on the map
function heater(map) {
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
	
	// for showing live elvation
	this.addLocationsInView = function(density) {
		var longs = this.right - this.left;
		var lats = this.top - this.bottom;
		
		// keeps our grid of points evenly-spaced
		var factor = (longs / lats) / (this.width / this.height); 
		
		// calc for non-square view window
		if (this.width > this.height) {
			var lngIncrement = longs / density;
			var latIncrement = lngIncrement / factor;
		} else {
			var latIncrement = lats / density;
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
	
	// for showing static elevation
	this.addRelevantLines = function(lines) {
		for (var i = 0; i < lines.length-1; i++) {
			var lineItems = lines[i].split(" ");
			
			// add point if it's in view (plus margin) and on land
			if (lineItems[0] > this.bottomer 	&& lineItems[0] < this.topper && 
				lineItems[1] > this.lefter	 	&& lineItems[1] < this.righter &&
				lineItems[2] > 0) { 

				this.landLocations.push(new google.maps.LatLng(lineItems[0], lineItems[1]));
				this.landElevations.push(lineItems[2]);

				// update elevation bounds if point actually in view
				if (lineItems[0] > this.bottom 	&& lineItems[0] < this.top && 
					lineItems[1] > this.left	&& lineItems[1] < this.right) {
					this.updateMaxMin(lineItems[2]);
				}
			}
		}
	}
	
	// used for both static and live
	this.showNewHeatmap = function() {

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
			gradient: (elevHeatmap && elevHeatmap.gradient) ? gradient() : null
	    });
	
		// add heatmap layer to the map
	    elevHeatmap.setMap(map);
		map.heatmap = true;

		updateInfo(this);
	}

	// create array of weighted points using landLocations and landElevations
	this.makeHeatmapElevData = function() {
		
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
	// - a few little helper instance methods of heater object -
	// ---------------------------------------------------------
	
	this.updateMaxMin = function(elev) {
		this.maxElevation = Math.max(this.maxElevation, elev);
		this.minElevation = Math.min(this.minElevation, elev);
	}
	
	this.getSliceOfLocations = function(step, totalSteps) {
		return this.locationsInView.slice(
			this.locationsInView.length * ((step - 1) / totalSteps), 
			this.locationsInView.length * (step / totalSteps)
		);
	}
	
	this.addPoint = function(location, elevation) {
		this.landLocations.push(location);
		this.landElevations.push(elevation);
		this.updateMaxMin(elevation);
	}
	
	this.showProgress = function(step, totalSteps) {
		$('#elev_info').html('Loading data... ' + 
			(this.locationsInView.length * (step / totalSteps)).toFixed(0) + 
			"/" + this.locationsInView.length);
	}
	
	this.updateInsideInfo = function() {
		$("#elev_info").html('Highest elevation: ' + 
			Math.round(this.maxElevation) + 
			' meters <br>Lowest elevation: ' + 
			Math.round(this.minElevation) + 
			' meters');
		$("#elev_info").append('<br>Heatmap created using ' + 
			this.heatmapElevData.length + ' points of data');
	}
	
} // end heater

// ---------------------------------------
// - a few little general helper methods -
// ---------------------------------------

function updateInfo(viewHeater) {

	// show info about current heatmap
	if (!viewHeater) {
		$('#elev_info').html('No heatmap');
	} else {
		viewHeater.updateInsideInfo();
	}

	// show current zoom level
	$("#elev_info").append('<br>Zoom level: ' + map.getZoom());
	if ((map.getZoom() > 16 || map.getZoom() < 12) && !map.liveData) {
		$("#elev_info").append(" ¡Static heatmap only really works for zoom levels between 12 and 16!");
	}
	
	// alert for live data use
	if (map.liveData) {
		var requests = $.cookie('requests');
		$("#alert_info").html("<div id='alert_live_info'><strong>¡Cuidado!</strong> Live data is subject to quotas set by the Google elevation API<br>You have currently used <strong>" + requests + "</strong> of your allowed <strong>25,000</strong> requests per day.<br>For more information, see \"Why is Live Data Problematic?\" below.</div>");
	} else {
		$("#alert_info").html("");
	}
}

function loadFile(filename) {
	var returned;
	$.ajax({
		url: filename,
		async: false,
		success: function(result) {
			returned = result.split("\n");
		}
	});
	return returned;
}

function influenceByZoomLevel(zoom) {
	if (map.liveData) return 45;
	
	if (zoom >= 17) return 110;
	if (zoom >= 16) return 80; 
	if (zoom >= 15) return 45; // additional data loaded at zoom 15 as well
	if (zoom >= 14) return 30;
	if (zoom >= 13) return 15;
	return 10;
}

function gradient() {
	return [
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
}

function changeGradient() {
	elevHeatmap.setOptions({
	    gradient: elevHeatmap.get('gradient') ? null : gradient()
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
