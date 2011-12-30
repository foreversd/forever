/*
 * macros.js: Test macros for the forever module
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */
 
var assert = require('assert'),
    path = require('path'),
    spawn = require('child_process').spawn,
    forever = require('../../lib/forever');
 
var macros = exports;

macros.assertTimes = function (script, times, options) {
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

