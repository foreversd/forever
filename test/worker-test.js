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

        worker.start(function () {
          reader.connect(path.join(SOCKET_PATH, 'worker.0.sock'), function () {
            reader.data(['pong'], self.callback.bind(self, null));
            reader.send(['ping']);
          });
        });
      },
      'it should respond with `pong`': function () {
      }
    }
  }
}).export(module);

