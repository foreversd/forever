/*
 * helpers.js: Test helpers for the forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */
 
var assert = require('assert'),
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

helpers.assertEmpty = function () {
  return {
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
  }
};