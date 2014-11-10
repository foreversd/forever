/*
 * stopbypid-peaceful-test.js: tests if `forever start` followed by `forever stop <pid>` works.
 *
 * (C) 2010 Charlie Robbins & the Contributors
 * MIT LICENCE
 *
 */

var assert = require('assert'),
  path = require('path'),
  fs = require('fs'),
  spawn = require('child_process').spawn,
  vows = require('vows'),
  forever = require('../../lib/forever');

function runCmd(cmd, args) {
  var proc = spawn(process.execPath, [
    path.resolve(__dirname, '../../', 'bin/forever'),
    cmd
  ].concat(args), {detached: true});
  proc.unref();
  return proc;
}
function grepConfig(that){
  setTimeout(function(that){
    var chunk = '';
    runCmd('config', []).stdout.on('data', function(data){
      // remove colors and `data` prefix
      line = data.toString().replace(/[\r\t\n\s]/g, '').replace(/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]/g, '').replace(/data:/g, '');
      chunk += line;
    });
    setTimeout(function(that){
      that.callback(null, chunk);
    }, 2000, that);
  }, 500, that)
}

vows.describe('forever/core/config').addBatch({
  "When using forever set" : {
    "to change root" : {
      topic: function () {
        runCmd('set', ['root /usr/src/.forever_clone', '--no-colors']);
        grepConfig(this);
      },
      "the pidPath/logPath/sockPath should be automatic changed too": function (err, result) {
        // root, pids, logs, sock
        assert.equal(result.match(/\/usr\/src\/\.forever_clone/g).length, 4);
      }
    }
  }
}).addBatch({
  "When executing forever list" : {
    "to list processes" : {
      topic: function () {
        runCmd('list', []);
        grepConfig(this);
      },
      "the configured root should not be changed": function (err, result) {
        // root, pids, logs, sock
        assert.equal(result.match(/\/usr\/src\/\.forever_clone/g).length, 4);
      }
    }
  }
}).addBatch({
  "When using forever set" : {
    "to change logstream" : {
      topic: function () {
        runCmd('set', ['logstream false']);
        grepConfig(this);
      },
      "the configured logstream should be a typeof Boolean": function (err, result) {
        var boolResult = (result.match(/logstream:([\s\S]{4,5})[,}]+/));
        assert.equal(boolResult.length, 2);
        // should equals `false` (Boolean), but not `'false'` or `"false"` (String)
        assert.equal(boolResult[1], 'false');
      }
    }
  }
}).addBatch({
  "When using forever set" : {
    "to change loglength" : {
      topic: function () {
        runCmd('set', ['loglength 200']);
        grepConfig(this);
      },
      "the configured logstream should be a typeof Number": function (err, result) {
        var numResult = (result.match(/loglength:(\d{3})/));
        assert.equal(numResult.length, 2);
        // should equals `200` (Number), but not `'200'` or `"200"` (String)
        assert.equal(numResult[1], '200');
      }
    }
  }
}).addBatch({
  "Reset configuration" : {
    "after all" : {
      topic: function () {
        runCmd('set', ['root ~/.forever']);
        setTimeout(function(that){
          that.callback();
        }, 2000, this);
      },
      "correctly": function () {

      }
    }
  }
}).export(module);