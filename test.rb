
file_data = {}

curr_line = "didn't work"
lines = []
elevs = []
start_lat = 40
start_lng = -125
step_size = 0.00083333333333333

f = File.open('/Users/jamesharris/Downloads/srtm_12_05/srtm_12_05.asc', 'r')
  6.times do
    puts f.gets
  end

  2605.times do |lat_steps|
    curr_line = f.gets
    if lat_steps >= 2604
      lng_steps = 2982
      10.times do |i|
        lat = start_lat - lat_steps*step_size
        lng = start_lng + (lng_steps + i)*step_size
        elevs = curr_line.split(" ")
        puts "lat steps: " + lat_steps.to_s + " lat: " + lat.to_s + 
            " lng steps: " + lng_steps.to_s + " lng: " + lng.to_s + 
            " elev: " + elevs[lng_steps+i].to_s
      end
    end
  end
f.close

puts "outside loop"


# looking for 37.705 -122.4565 124.8446731567383
# should be ~on line 2761 at col 3052

=begin
  NEXT:
  3. write explanation/story/title/etc
  
  LATER:
  1. download Marin and Peninsula data using JSON and JQuery
  2. single click on map shows elevation at that point
  3. revisit accuracy issue - more data at higher zooms
  2. add ability to jump to new territory with search box
  2. web interface to specify new area to download
  4. (?) mouseover elevation
  2. (?) fix the flashing - clear only after a reload is done 
    - no reloading file may help this - UPDATE: nope, it doesn't
  4. (?) user can set accuracy for live data
  6. redo whole thing in openStreetMap to show elev of blocks/streets
  
  DONE:
  3. better colors - combine the color schemes 
  3. can access session/cookies data using js?
    - to keep track of live data use
  4. alert for live data use
  1. refine live data heatmap - eliminate water spots 
  2. refactor - e.g. adding heatmap to map is repeated code
  4. adjust influence radius for live data
  4. make buttons logical
  2. style it with bootstrap CSS / otherwise make it pretty
  2. separate maps into a new github project, make it live just by loading from there
    - start local http server with 'python -mSimpleHTTPServer' in terminal
    - will require an index.html
  3. display more information - zoom level, max/min elevation shown
  2. get rid of pure js, insert jquery
  2. refactor with smaller readable methods
  3. eliminate green border at edge of view window
  2. avoid loading file when not necessary
  1. make it work on Heroku
  1. relative file path names
  2. clean up the uneccesary stuff / comment
  5. auto-redo heat map upon zoom or view change?
  
  QUESTIONS:
  1. javascript file is huge with huge methods - is there better way to write it?
  2. why doesn't Heroku work?
  3. best way to present this stuff - separate urls? separate GitHub projects? all in one?
  4. better method than heat map?
  5. better to do it in openStreetMap? even for simple grid-based coloring?
  6. how does basic manipulation of OpenStreetMap work?  drawing layers, etc?
=end

