/*
 * signal-test.js: Tests for spin restarts in forever.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../../lib/forever');

vows.describe('forever/monitor/signal').addBatch({
  "When using forever": {
    "and spawning a script that ignores signals SIGINT and SIGTERM": {
      "with killTTL defined": {
        topic: function () {
          var script = path.join(__dirname, '..', '..', 'examples', 'signal-ignore.js'),
              child = new (forever.Monitor)(script, { silent: true, killTTL: 1000 }),
              callback = this.callback,
              timer;

          timer = setTimeout(function () {
            callback(new Error('Child did not die when killed by forever'), child);
          }, 3000);
              
          child.on('exit', function () {
            callback.apply(null, [null].concat([].slice.call(arguments)));
            clearTimeout(timer);
          });
          
          child.on('start', function () {
            //
            // Give it time to set up signal handlers
            //
            setTimeout(function() {
              child.stop();
            }, 1000);
          });
          
          child.start();
        },
        "should forcibly kill the processes": function (err, child, spinning) {
          assert.isNull(err);
        }
      }
    }
  }
}).export(module);
