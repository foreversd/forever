/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    eyes = require('eyes'),
    path = require('path'),
    events = require('events'),
    spawn = require('child_process').spawn;

var Forever = function (file, options) {
  events.EventEmitter.call(this);
  
  this.times = 0;
  options.options.unshift(path.join(__dirname, file));
  this.options = options;
};

sys.inherits(Forever, events.EventEmitter);

Forever.prototype.run = function () {
  var self = this, child = spawn('node', this.options.options);
  this.child = child;
  
  child.stdout.on('data', function (data) {
    if (!self.options.silent) {
      process.stdout.write(data);
    }
  });
  
  child.stderr.on('data', function (data) {
    if (!self.options.silent) {
      process.stdout.write(data);
    }
  });
  
  child.on('exit', function (code) {
    self.times++;
    if (self.options.forever || self.times < self.options.max) {
      self.emit('restart');
      self.run();
    }
    else {
      self.emit('exit');
    }
  });
};

exports.run = function (file, options) {
  var forever = new Forever(file, options);
  forever.run();
  return forever;
};