/*
 * tail-stopall-test.js: Tests for forever.tail() and forever.stopAll()
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    path = require('path'),
    spawn = require('child_process').spawn,
    vows = require('vows'),
    forever = require('../../lib/forever');

vows.describe('forever/core/tail').addBatch({
  "When using forever": {
    "the tail() method": {
      topic: function () {
        var that = this;
        
        that.child = spawn('node', [path.join(__dirname, '..', 'fixtures', 'start-daemon.js')]);
        setTimeout(function () {
          forever.tail(0, that.callback);
        }, 2000);
      },
      "should respond with logs for the script": function (err, procs) {
        assert.isNull(err);
        assert.isArray(procs);
        procs.forEach(function (proc) {
          assert.isArray(proc.logs);
          assert.isTrue(!!proc.logs.length);
          assert.isTrue(proc.logs.length > 10);
          // Temporary hack, remove after warnings are gone.
          proc.logs = proc.logs.slice(1);
          proc.logs.forEach(function (line) {
            assert.match(line, /^Logging at/);
          });
        });
      }
    }
  }
}).addBatch({
  "When the tests are over": {
    "stop all forever processes": {
      topic: function () {
        forever.stopAll().on('stopAll', this.callback.bind(null, null));
      },
      "should stop the correct number of procs": function (err, procs) {
        assert.isArray(procs);
        assert.lengthOf(procs, 1);
      }
    }
  }
}).export(module);
