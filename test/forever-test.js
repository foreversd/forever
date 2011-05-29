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
    "and instance of Forever passed valid options": {
      "should have correct properties set": function () {
        var child = new (forever.Forever)('any-file.js', {
          max: 10,
          silent: true,
          options: []
        });
        
        assert.isArray(child.options);
        assert.equal(child.max, 10);
        assert.isTrue(child.silent);
        assert.isFunction(child.start);
        assert.isFunction(child.save);
        assert.isFunction(child.stop); 
      }
    }
  },
  "running error-on-timer sample three times": {
    topic: function () {
      var child = new (forever.Forever)(path.join(__dirname, '..', 'examples', 'error-on-timer.js'), {
        max: 3,
        minUptime: 200,
        silent: true,
        outFile: 'test/stdout.log',
        errFile: 'test/stderr.log',
        options: []
      });
      
      child.on('exit', this.callback.bind({}, null));
      child.start();
    },
    "should emit 'exit' when completed": function (err, child) {
      assert.equal(child.times, 3);
    }
  },
  "non-node usage with a perl one-liner": {
    topic: function () {
      var child = forever.start([ 'perl', '-le', 'print "moo"' ], {
        max: 1,
        silent: true,
      });
      child.on('stdout', this.callback.bind({}, null));
    },
    "should get back moo": function (err, buf) {
      assert.equal(buf.toString(), 'moo\n');
    }
  },
  "attempting to start a script that doesn't exist": {
    topic: function () {
      var child = forever.start('invalid-path.js', {
        max: 1,
        silent: true
      });
      child.on('error', this.callback.bind({}, null));
    },
    "should throw an error about the invalid file": function (err) {
      assert.isNotNull(err);
      assert.isTrue(err.message.indexOf('does not exist') !== -1);
    }
  }
}).addBatch({
  "When the tests are over": {
    "a call to forever.list()": {
      topic: function () {
        var that = this;
        var tidy = forever.cleanUp(true, true);
        
        tidy.on('cleanUp', function () {
          that.callback(null, forever.list(false));
        });
      },
      "should respond with no processes": function (err, procs) {
        assert.isNull(err);
        assert.isNull(procs);
      }
    }
  }
}).export(module);
