/*
 * forever-test.js: Tests for forever module
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../lib/forever'),
    helpers = require('./helpers');

vows.describe('forever').addBatch({
  "When using forever": {
    "an instance of forever.Monitor with valid options": {
      topic: new (forever.Monitor)(path.join(__dirname, '..', 'examples', 'server.js'), {
        max: 10,
        silent: true,
        options: ['-p', 8090]
      }),
      "should have correct properties set": function (child) {
        assert.isArray(child.options);
        assert.equal(child.max, 10);
        assert.isTrue(child.silent);
        assert.isFunction(child.start);
        assert.isObject(child.data);
        assert.isFunction(child.stop);
      },
      "calling the restart() method in less than `minUptime`": {
        topic: function (child) {
          var that = this;
          child.once('start', function () {
            child.once('restart', that.callback.bind(this, null));
            child.restart();
          });
          child.start();
        },
        "should restart the child process": function (_, child, data) {
          assert.isObject(data);
          child.kill(true);
        }
      }
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
    },
    "checking if process exists": {
      "if process process exists": {
        topic: forever.checkProcess(process.pid),
        "should return true": function (result) {
          assert.isTrue(result);
        }
      },
      "if process doesn't exist": {
        topic: forever.checkProcess(255 * 255 * 255),
        //
        // This is insanely large value. On most systems there'll be no process
        // with such PID. Also, there's no multiplatform way to check for
        // PID limit.
        //
        "should return false": function (result) {
          assert.isFalse(result);
        }
      }
    }
  }
}).export(module);
