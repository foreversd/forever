var path = require('path'),
    assert = require('assert'),
    vows = require('vows'),
    nssocket = require('nssocket'),
    macros = require('../helpers/macros'),
    MonitorMock = require('../helpers/mocks/monitor').MonitorMock;

var SOCKET_PATH = path.join(__dirname, '..', 'fixtures');

vows.describe('forever/worker/simple').addBatch({
  'When using forever worker': {
    'and starting it and pinging it': macros.assertWorkerConnected({
      monitor: new MonitorMock(),
      sockPath: SOCKET_PATH
    }, {
      'and respond to pings': {
        topic: function (reader) {
          reader.send(['ping']);
          reader.data(['pong'], this.callback);
        },
        'with `pong`': function () {}
      },
      'and when queried for data': {
        topic: function (reader, _, options) {
          var self = this;

          reader.send(['data']);
          reader.data(['data'], function (data) {
            self.callback(null, { data: data, monitor: options.monitor });
          });
        },
        'it should respond with data': function (obj) {
          assert.isObject(obj.data);
          assert.deepEqual(obj.data, obj.monitor.data);
        }
      },
      'and when asked to kill the process': {
        topic: function (reader, _, options) {
          var self = this;

          options.monitor.running = true;
          reader.send(['stop']);
          reader.data(['stop', 'ok'], function () {
            self.callback(null, options.monitor);
          });
        },
        'it should kill the process': function (monitor) {
          assert.isFalse(monitor.running);
        }
      }
    })
  }
}).export(module);

