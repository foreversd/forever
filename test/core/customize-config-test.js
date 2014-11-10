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

vows.describe('forever/core/config').addBatch({
  "When using forever set" : {
    "to change root" : {
      topic: function () {
        runCmd('set', ['root /usr/src/.forever_clone']);
        setTimeout(function(that){
          that.callback();
        }, 2000, this);
      },
      "the pidPath/logPath/sockPath should be automatic changed too": function () {
        var root = forever.config.get('root');
        assert.equal(root, '/usr/src/.forever_clone');
        console.log(forever.config.get('pidPath').indexOf(root), 0);
        console.log(forever.config.get('sockPath').indexOf(root), 0);
        console.log(forever.config.get('logPath').indexOf(root), 0);
      }
    }
  }
}).addBatch({
  "When executing forever list" : {
    "to list processes" : {
      topic: function () {
        runCmd('list', []);
        setTimeout(function (that) {
          that.callback();
        }, 2000, this);
      },
      "the configured root should not be changed": function () {
        var root = forever.config.get('root');
        assert.equal(root, '/usr/src/.forever_clone');
      }
    }
  }
}).addBatch({
  "When using forever set" : {
    "to change logstream" : {
      topic: function () {
        runCmd('set', ['logstream false']);
        setTimeout(function (that) {
          that.callback();
        }, 2000, this);
      },
      "the configured logstream should be a typeof Boolean": function () {
        var logstream = forever.config.get('logstream');
        assert.equal(typeof logstream, 'boolean');
        assert.equal(logstream, false);
      }
    }
  }
}).addBatch({
  "When using forever set" : {
    "to change loglength" : {
      topic: function () {
        runCmd('set', ['loglength 200']);
        setTimeout(function (that) {
          that.callback();
        }, 2000, this);
      },
      "the configured logstream should be a typeof Number": function () {
        var loglength = forever.config.get('loglength');
        assert.equal(typeof loglength, 'number');
        assert.equal(loglength, 200);
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