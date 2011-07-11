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