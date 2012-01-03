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
    forever = require('../lib/forever');

vows.describe('forever/spin-restart').addBatch({
  "When using forever": {
    "and spawning a script that uses `process.send()`": {
      topic: function () {
        var script = path.join(__dirname, '..', 'examples', 'process-send.js'),
            child = new (forever.Monitor)(script, { silent: true, minUptime: 2000, max: 1 });

        child.on('message', this.callback.bind(null, null));
        child.start();
      },
      "should reemit the message correctly": function (err, child, spinning) {
        console.dir(arguments);
      }
    }
  }
}).export(module);
