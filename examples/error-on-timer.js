/*
 * error-on-timer.js: Sample script that errors on a timer
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys');

setTimeout(function () {
  sys.puts('Throwing error now.');
  throw new Error('User generated fault.');
}, 200);
