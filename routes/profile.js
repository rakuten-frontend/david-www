var profile = require("../lib/profile")
var errors = require("./helpers/errors")

module.exports = function (req, res) {
  var authToken = null

  req.session.getAll(function (err, sessionData) {
    if (req.params.user === sessionData["session/user"]) {
      authToken = sessionData["session/access-token"]
    }

    profile.get(req.params.user, authToken, function (er, data) {
      if (errors.happened(er, req, res, "Failed to get profile data")) {
        return
      }

      var avatarUrl

      res.render("profile", {
        user: req.params.user,
        avatarUrl: avatarUrl,
        repos: data
      })
    })
  })
}
