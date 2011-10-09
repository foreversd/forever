/*
 * test-hook.js: Test hook fixture for raising an event on forever.Monitor `exit`
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var events = require('events'),
    util = require('util');

var TestHook = exports.TestHook = function () { 
  events.EventEmitter.call(this);
};

util.inherits(TestHook, events.EventEmitter);

TestHook.prototype.attach = function (monitor) {
  var self = this;
  monitor.on('exit', function () {
    self.emit.apply(self, ['hook-exit'].concat(arguments));
  });
};