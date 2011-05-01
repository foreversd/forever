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
    "and spawning two processes using the same script": {
      topic: function () {
        var that = this,
            script = path.join(__dirname, '..', 'examples', 'server.js'),
            child1 = new (forever.Forever)(script, { 'options': [ "--port=8080"] });
        
        var tidy = forever.cleanUp(true);
        tidy.on('cleanUp', function () {
          child1.on('start', function () {
            var child2 = new (forever.Forever)(script, { 'options': [ "--port=8081"] });          
            child2.on('start', function () {
              that.callback(null, forever.list(false));
            });

            child2.start();

          });

          child1.start();
        });        
      },
      "should spawn both processes appropriately": function (err, procs) {
        assert.isNull(err);
        assert.length(procs, 2);
      }
    }
  },
}).export(module);
