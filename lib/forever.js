/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    eyes = require('eyes'),
    spawn = require('child_process').spawn;

var forever = exports;

forever.run = function (options) {
  var child = spawn('node', options.options);
  child.stdout.on('data', function (data) {
    if (!options.silent) {
      process.stdout.write(data);
    }
  });
  
  child.stderr.on('data', function (data) {
    if (!options.silent) {
      process.stdout.write(data);
    }
  });
  
  child.on('exit', function (code) {
    options.times++;
    if (options.forever || options.times < options.max) {
      forever.run(options);
    }
  });
};

