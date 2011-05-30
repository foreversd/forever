/*
 * forever-test.js: Tests for forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

require.paths.unshift(require('path').join(__dirname, '..', 'lib'));

var sys = require('sys'),
    assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('forever');

vows.describe('forever/spin-restart').addBatch({
  "When using forever": {
    "and spawning a script that spin restarts": {
      "with no spinSleepTime specified": {
        topic: function () {
          var script = path.join(__dirname, '..', 'examples', 'always-throw.js'),
              child = new (forever.Forever)(script, { silent: true, max: 3 });

          child.on('exit', this.callback.bind({}, null));
          child.start();
        },
        "should spawn both processes appropriately": function (err, child, spinning) {
          assert.isTrue(spinning);
        },
        "should not restart spinning processes": function (err, child, spinning) {
          assert.equal(child.times, 0);
        }
      },

      "with a spinSleepTime specified": {
        topic: function () {
          var script = path.join(__dirname, '..', 'examples', 'always-throw.js'),
              child = new (forever.Forever)(script, { silent: true, max: 3, spinSleepTime: 1 });

          child.on('exit', this.callback.bind({}, null));
          child.start();
        },
        "should restart spinning processes": function (err, child, spinning) {
          assert.equal(child.times, 3);
        }
      }
    }
  }
}).export(module);
