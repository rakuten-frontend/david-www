/**
 * Events:
 * dependenciesChange(differences, manifest, user, repo, private) - When one or more dependencies for a manifest change
 * devDependenciesChange(differences, manifest, user, repo, private) - When one or more devDependencies for a manifest change
 * peerDependenciesChange(differences, manifest, user, repo, private) - When one or more peerDependencies for a manifest change
 * optionalDependenciesChange(differences, manifest, user, repo, private) - When one or more optionalDependencies for a manifest change
 * retrieve(manifest, user, repo, private) - The first time a manifest is retrieved
 */

var events = require("events")
  , moment = require("moment")
  , config = require("config")
  , registry = require("./registry")
  , depDiff = require("dep-diff")
  , batch = require("./batch")()
  , request = require("request")

module.exports = exports = new events.EventEmitter()

function Manifest (data, priv) {
  this.data = data
  this.private = priv // Is manifest in a private repo?
  this.expires = moment().add(Manifest.TTL)
}

Manifest.TTL = moment.duration({hours: 1})

var manifests = {}

/**
 * Prevent JSON.parse errors from going postal and killing us all.
 * Currently we smother SyntaxError and the like into a more manageable null.
 * We may do something more clever soon.
 *
 * @param body
 * @return {*}
 */
function parseManifest (body) {
  try {
    // JSON.parse will barf with a SyntaxError if the body is ill.
    return JSON.parse(body)
  } catch (error) {
    return null
  }
}

exports.getManifest = function (user, repo, ref, authToken, cb) {
  // if ref is "undefined" - use default branch
  ref = ref || null
  var manifest = manifests[user] && manifests[user][repo] ? manifests[user][repo][ref] : null

  if (manifest && !manifest.private && manifest.expires > new Date()) {
    console.log("Using cached manifest", manifest.data.name, manifest.data.version, ref)
    return cb(null, JSON.parse(JSON.stringify(manifest.data)))
  }

  var batchKey = [user, repo, authToken].join("-")
  
  if (batch.exists(batchKey)) {
    return batch.push(batchKey, cb)
  }

  batch.push(batchKey, cb)

  var opts = {user: user, repo: repo, path: "package.json"}

  // Add "ref" options if ref is set. Otherwise use default branch.
  if (ref) {
    opts.ref = ref
  }

  var stash = config.stash
  var url = stash.protocol + "://" + stash.user.name + ":" + stash.user.password + "@" + stash.host + "/projects/" + user + "/repos/" + repo + "/browse/package.json?raw"
  if (ref) {
    url += "&at=" + ref
  }

  request(url, function (er, response, body) {
    if (er) {
      console.error("Failed to get package.json", er)
      return batch.call(batchKey, function (cb) { cb(er) })
    }

    if (manifest && manifest.expires > new Date()) {
      console.log("Using cached private manifest", manifest.data.name, manifest.data.version, ref)
      return batch.call(batchKey, function (cb) {
        cb(null, JSON.parse(JSON.stringify(manifest.data)))
      })
    }

    var packageJson = body
    var data = parseManifest(packageJson)

    if (!data) {
      console.error("Failed to parse package.json: ", packageJson)
      return batch.call(batchKey, function (cb) {
        cb(new Error("Failed to parse package.json: " + packageJson))
      })
    }

    console.log("Got manifest", data.name, data.version, ref)

    onGetRepo(null, {"private": false})

    function onGetRepo (er, repoData) {
      if (er) {
        console.error("Failed to get repo data", user, repo, er)
        return batch.call(batchKey, function (cb) { cb(er) })
      }

      var oldManifest = manifest

      data.ref = ref
      manifest = new Manifest(data, repoData.private)

      manifests[user] = manifests[user] || {}
      manifests[user][repo] = manifests[user][repo] || {}
      manifests[user][repo][ref] = manifest

      console.log("Cached at", user, repo, ref);
      
      batch.call(batchKey, function (cb) {
        cb(null, manifest.data)
      })

      if (!oldManifest) {
        exports.emit("retrieve", manifest.data, user, repo, repoData.private)
      } else {

        var oldDependencies = oldManifest ? oldManifest.data.dependencies : {}
          , oldDevDependencies = oldManifest ? oldManifest.data.devDependencies : {}
          , oldPeerDependencies = oldManifest ? oldManifest.data.peerDependencies : {}
          , oldOptionalDependencies = oldManifest ? oldManifest.data.optionalDependencies : {}

        var diffs = depDiff(oldDependencies, data.dependencies)

        if (diffs.length) {
          exports.emit("dependenciesChange", diffs, manifest.data, user, repo, repoData.private)
        }

        diffs = depDiff(oldDevDependencies, data.devDependencies)

        if (diffs.length) {
          exports.emit("devDependenciesChange", diffs, manifest.data, user, repo, repoData.private)
        }

        diffs = depDiff(oldPeerDependencies, data.peerDependencies)

        if (diffs.length) {
          exports.emit("peerDependenciesChange", diffs, manifest.data, user, repo, repoData.private)
        }

        diffs = depDiff(oldOptionalDependencies, data.optionalDependencies)

        if (diffs.length) {
          exports.emit("optionalDependenciesChange", diffs, manifest.data, user, repo, repoData.private)
        }
      }
    }
  })
}

/**
 * Set the TTL for cached manifests.
 *
 * @param {moment.duration} duration Time period the manifests will be cahced for, expressed as a moment.duration.
 */
exports.setCacheDuration = function (duration) {
  Manifest.TTL = duration
}
