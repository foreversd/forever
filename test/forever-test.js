/*
 * forever-test.js: Tests for forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../lib/forever'),
    helpers = require('./helpers');

vows.describe('forever').addBatch({
  "When using forever": {
    "an instance of forever.Monitor with valid options": {
      "should have correct properties set": function () {
        var child = new (forever.Monitor)('any-file.js', {
          max: 10,
          silent: true,
          options: []
        });
        
        assert.isArray(child.options);
        assert.equal(child.max, 10);
        assert.isTrue(child.silent);
        assert.isFunction(child.start);
        assert.isObject(child.data);
        assert.isFunction(child.stop); 
      },
      "running error-on-timer sample three times": helpers.assertTimes(
        path.join(__dirname, '..', 'examples', 'error-on-timer.js'),
        3,
        {
          minUptime: 200,
          silent: true,
          outFile: 'test/stdout.log',
          errFile: 'test/stderr.log',
          options: []
        }
      ),
      "running error-on-timer sample once": helpers.assertTimes(
        path.join(__dirname, '..', 'examples', 'error-on-timer.js'),
        1,
        {
          minUptime: 200,
          silent: true,
          outFile: 'test/stdout.log',
          errFile: 'test/stderr.log',
          options: []
        }
      ),
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
    }
  }
}).export(module);