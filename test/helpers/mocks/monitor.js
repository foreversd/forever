var util = require('util'),
    events = require('eventemitter2'),
    ChildProcessMock = require('./child-process').ChildProcessMock;

var MonitorMock = exports.MonitorMock = function () {
  this.child = new ChildProcessMock();
  this.running = false;
};
util.inherits(MonitorMock, events.EventEmitter2);

MonitorMock.prototype.__defineGetter__('data', function () {
  return {
    uid: '_uid',
    command: 'node'
  };
});

MonitorMock.prototype.kill = MonitorMock.prototype.stop = function (forceStop) {
  this.running = false;

  this.emit('stop');
};

