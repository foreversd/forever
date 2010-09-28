/*
 * count-timer.js: Counts forever on a timer
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */
 
var sys = require('sys'); 

var count = 0;

var id = setInterval(function () {
  sys.puts('Count is ' + count + '. Incrementing now.');
  count++;
}, 1000);
