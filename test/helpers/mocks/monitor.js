var util = require('util'),
    broadway = require('broadway'),
    ChildProcessMock = require('./child-process').ChildProcessMock;

var MonitorMock = exports.MonitorMock = function (options) {
  broadway.App.call(this, options);

  this.child = new ChildProcessMock();
};
util.inherits(MonitorMock, broadway.App);

MonitorMock.prototype.__defineGetter__('data', function () {
  return {
    uid: '_uid',
    command: 'node'
  }
});

