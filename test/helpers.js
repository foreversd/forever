/*
 * helpers.js: Test helpers for the forever module
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */
 
var assert = require('assert'),
    path = require('path'),
    spawn = require('child_process').spawn,
    forever = require('../lib/forever');
 
var helpers = exports;

helpers.assertTimes = function (script, times, options) {
  options.max = times;
  
  return {
    topic: function () {
      var child = new (forever.Monitor)(script, options);
      child.on('exit', this.callback.bind({}, null));
      child.start();
    },
    "should emit 'exit' when completed": function (err, child) {
      assert.equal(child.times, times);
    }
  }
};

helpers.spawn = function (args, options) {
  options.topic = function () {
    var self = this;

    args = [path.join(__dirname, '..', 'bin', 'forever')].concat(args);

    var child = spawn(process.argv[0], args),
        stdout = '',
        stderr = '';

    child.stdout.on('data', function (data) {
      stdout += data;
    });
    child.stderr.on('data', function (data) {
      stderr += data;
    });
    child.once('exit', function (exitCode) {
      //
      // Remark: We wait 200 ms because of forever boot up time (master
      // doesn't wait for slave to start up after it's forked, it just quits)
      //
      setTimeout(function () {
        self.callback(null, exitCode, stdout, stderr);
      }, 200);
    });
  };
  return options;
};

helpers.list = function (options) {
  options.topic = function () {
    forever.list(false, this.callback)
  };
  return options;
};

helpers.assertStartsWith = function (string, substring) {
  assert.equal(string.slice(0, substring.length), substring);
};

helpers.assertList = function (list) {
  assert.isNotNull(list);
  assert.lengthOf(list, 1);
};