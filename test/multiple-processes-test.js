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

vows.describe('forever/multiple-processes').addBatch({
  "When using forever": {
    "and spawning two processes using the same script": {
      topic: function () {
        var that = this,
            script = path.join(__dirname, '..', 'examples', 'server.js');
            
        this.child1 = new (forever.Forever)(script, { 
          silent: true,
          maxRestart: 1,
          options: [ "--port=8080"] 
        });
        
        var tidy = forever.cleanUp(true);
        tidy.on('cleanUp', function () {
          that.child1.on('start', function () {
            that.child2 = new (forever.Forever)(script, { 
              silent: true,
              maxRestart: 1,
              options: [ "--port=8081"] 
            });
            
            that.child2.on('start', function () {
              that.callback(null, forever.list(false));
            });

            that.child2.start();
          });

          that.child1.start();
        });        
      },
      "should spawn both processes appropriately": function (err, procs) {
        assert.isNull(err);
        assert.length(procs, 2);
        this.child1.stop();
        this.child2.stop();
      }
    }
  },
}).export(module);
