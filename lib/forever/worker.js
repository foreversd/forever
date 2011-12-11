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
  options || (options = {});

  this.monitor  = options.monitor;
  this.sockPath = options.sockPath || forever.config.get('sockPath');
  this.exitOnKill = options.exitOnKill === true;

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

    socket.data(['spawn'], function (data) {
      if (!data.script) {
        return socket.send(['spawn', 'error'], { error: new Error('No script given') });
      }

      if (this.monitor) {
        return socket.send(['spawn', 'error'], { error: new Error("Already running") });
      }

      var monitor = new (forever.Monitor)(data.script, data.options);
      monitor.start();

      monitor.on('start', function () {
        socket.send(['spawn', 'start']);
      });
    });

    socket.data(['kill'], function () {
      self.monitor.on('stop', function () {
        socket.send(['kill', 'stop']);
        this.exitOnKill && process.exit();
      });
      self.monitor.kill();
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

      //
      // If we're a fork, notify master that server is set up and waiting for
      // commands.
      //
      process.send && process.send('listening', sock);
    });
  });
};

