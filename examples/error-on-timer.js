/*
 * error-on-timer.js: Sample script that errors on a timer
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

var util = require('util');

setTimeout(function () {
  util.puts('Throwing error now.');
  throw new Error('User generated fault.');
}, 200);
