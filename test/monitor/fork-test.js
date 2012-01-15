/*
 * spin-test.js: Tests for spin restarts in forever.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../../lib/forever');

vows.describe('forever/monitor/fork').addBatch({
  "When using forever": {
    "and spawning a script that uses `process.send()`": {
      "using the 'native' fork": {
        topic: function () {
          var script = path.join(__dirname, '..', '..', 'examples', 'process-send.js'),
              child = new (forever.Monitor)(script, { silent: false, minUptime: 2000, max: 1, fork: true });

          child.on('message', this.callback.bind(null, null));
          child.start();
        },
        "should reemit the message correctly": function (err, msg) {
          assert.isObject(msg);
          assert.deepEqual(msg, { from: 'child' });
        }
      },
      "with `forkShim` true": {
        topic: function () {
          var script = path.join(__dirname, '..', '..', 'examples', 'process-send.js'),
              child
              
          child = this.child = new (forever.Monitor)(script, { 
            silent: false, 
            minUptime: 2000, 
            max: 1, 
            fork: true,
            forkShim: true
          });

          child.on('message', this.callback.bind(this, null));
          child.start();
        },
        "should reemit the message correctly": function (err, msg) {
          assert.isObject(msg);
          assert.deepEqual(msg, { from: 'child' });
          this.child.child.kill();
        }
      }
    }
  }
}).export(module);
