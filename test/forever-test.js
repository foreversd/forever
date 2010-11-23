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
    eyes = require('eyes'),
    forever = require('forever');

vows.describe('forever').addBatch({
  "When using forever": {
    topic: function () {
      forever.load({}, this.callback);
    },
    "and instance of Forever passed valid options": {
      topic: function () {
        var child = new (forever.Forever)('any-file.js', {
          max: 10,
          silent: true,
          options: []
        });
        
        // Emit a useless callback since we can't return 
        // an instance of an events.EventEmitter
        child.on('test', this.callback);
        child.emit('test', null, child);
      },
      "should have correct properties set": function (err, child) {
        assert.isNotNull(child.options);
        assert.equal(child.options.max, 10);
        assert.isTrue(child.options.silent);
        assert.isArray(child.options.options);
        assert.isFunction(child.start);
        assert.isFunction(child.save);
        assert.isFunction(child.stop); 
      }
    }
  },
  "when running error-on-timer sample three times": {
    topic: function () {
      var child = new (forever.Forever)(path.join(__dirname, '..', 'samples', 'error-on-timer.js'), {
        max: 3,
        silent: true,
        outFile: 'test/stdout.log',
        errFile: 'test/stderr.log',
        options: []
      });
      
      child.on('exit', this.callback);
      child.start();
    },
    "should emit 'exit' when completed": function (err, child) {
      assert.equal(child.times, 3);
    }
  }
}).export(module);
