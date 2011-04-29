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

vows.describe('forever').addBatch({
  "When using forever": {
    "and spawning a script that spin restarts": {
      topic: function () {
        var script = path.join(__dirname, '..', 'examples', 'always-throw.js'),
            child = new (forever.Forever)(script, { silent: true });

        child.on('exit', this.callback.bind(null, null));
        child.start();
      },
      "should spawn both processes appropriately": function (err, monitor, spinning) {
        assert.isTrue(spinning);
      }
    }
  },
}).export(module);
