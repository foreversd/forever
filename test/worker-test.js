var path = require('path'),
    assert = require('assert'),
    vows = require('vows'),
    nssocket = require('nssocket'),
    Worker = require('../lib/forever/worker').Worker;

var SOCKET_PATH = path.join(__dirname, 'fixtures');

vows.describe('forever/worker').addBatch({
  'When using forever worker': {
    'and starting it and pinging it': {
      topic: function () {
        var self = this;

        var worker = new Worker({ sockPath: SOCKET_PATH }),
            reader = new nssocket.NsSocket();

        worker.start(function (err, sock) {
          reader.connect(sock, function () {
            self.callback(null, reader);
          });
        });
      },
      'it should connect': {
        'and respond to pings': {
          topic: function (reader) {
            reader.send(['ping']);
            reader.data(['pong'], this.callback);
          },
          'with `pong`': function () {}
        }
      }
    }
  }
}).export(module);

