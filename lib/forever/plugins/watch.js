
var fs = require('fs'),
    path = require('path'),
    minimatch = require('minimatch'),
    watch = require('watch'),
    forever = require('../../forever');

exports.name = 'watch';

//
// ### @private function _watchFilter
// #### @file {string} File name
// Determines whether we should restart if `file` change (@mikeal's filtering
// is pretty messed up).
//
function watchFilter(fileName) {
  if (this.watchIgnoreDotFiles && path.basename(fileName)[0] === '.') {
    return false;
  }

  fileName = path.relative(this.watchDirectory, fileName);

  for (var key in this.watchIgnorePatterns) {
    if (minimatch(fileName, this.watchIgnorePatterns[key], { matchBase: true })) {
      return false;
    }
  }

  return true;
};

exports.attach = function () {
  var monitor = this;

  fs.readFile(path.join(this.watchDirectory, '.foreverignore'), 'utf8', function (err, data) {
    if (err) {
      forever.log.warn('Could not read .foreverignore file.');
      return forever.log.silly(err.message);
    }

    Array.prototype.push.apply(monitor.watchIgnorePatterns, data.split('\n'));
  });

  watch.watchTree(this.watchDirectory, function (f, curr, prev) {
    if (!(curr === null && prev === null && typeof f === 'object')) {
      //
      // `curr` == null && `prev` == null && typeof f == "object" when watch
      // finishes walking the tree to add listeners. We don't need to know
      // about it, so we simply ignore it (anything different means that
      // some file changed/was removed/created - that's what we want to know).
      //
      if (watchFilter.call(monitor, f)) {
        forever.log.info('restaring script because ' + f + ' changed');
        monitor.restart();
      }
    }
  });
};
