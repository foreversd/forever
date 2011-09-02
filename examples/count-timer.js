/*
 * count-timer.js: Counts forever on a timer
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */
 
var util = require('util');

var count = 0;

var id = setInterval(function () {
  util.puts('Count is ' + count + '. Incrementing now.');
  count++;
}, 1000);
