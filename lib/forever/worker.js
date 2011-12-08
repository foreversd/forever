var fs = require('fs'),
    path = require('path'),
    nssocket = require('nssocket'),
    forever = require('../forever');

function findSocket(sockPath, startAt, callback) {
  if (typeof startAt == "function") {
    callback = startAt;
    startAt = null;
  }

  startAt || (startAt = 0);
  var sock = path.join(sockPath, 'worker.' + startAt + '.sock');
  fs.stat(sock, function (err, stat) {
    if (err) {
      if (err.code == 'ENOENT') {
        return callback(null, sock)
      }
      return callback(err);
    }
    return findSocket(sockPath, ++startAt, callback);
  });
}

var Worker = exports.Worker = function (options) {
  this.monitor  = options.monitor;
  this.sockPath = options.sockPath || forever.config.get('sockPath');

  this._socket = null;
};

Worker.prototype.start = function (cb) {
  var self = this;

  if (this._socket) throw new Error("Can't start already started worker");

  self._socket = nssocket.createServer(function (socket) {
    socket.data(['ping'], function () {
      socket.send(['pong']);
    });

    socket.data(['data'], function () {
      socket.send(['data'], self.monitor.data);
    });
  });

  findSocket(self.sockPath, function (err, sock) {
    if (err) {
      return cb && cb(err);
    }
    self._socket.listen(sock, function () {
      //
      // `listening` listener doesn't take error as the first parameter
      //
      cb && cb(null, sock);
    });
  });
};

