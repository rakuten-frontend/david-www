/* jshint browser:true, jquery:true */

var d3 = require("d3")
var david = require("./david")

require("./vendor/jquery.feed")

$("#home-page").each(function () {

  // Render the dependency counts graph
  d3.json("dependency-counts.json", function (er, data) {
    if (er) return console.error("Failed to get dependency counts", er)
    david.renderDependencyCountsGraph(data)
  })

  var url = $(".badge-maker span")
    , badge = $(".badge-maker img")

  // Update the image when the user changes the url
  url.on("input", function () {
    badge.attr("src", url.text() + ".svg")
  })

  // Red text if the url isn"t good for it.
  badge.error(function () {
    url.addClass("nope")
    badge.hide()
  })

  // Green text if it is... wait a minute should this be tied to repo health not.
  badge.load(function () {
    if (badge.attr("src") == "/img/status/outofdate.svg") return;
    url.removeClass("nope")
    badge.show()
  })

})
