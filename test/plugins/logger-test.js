var assert = require('assert'),
    vows = require('vows')
    StreamMock = require('../helpers/mocks/stream').StreamMock,
    MonitorMock = require('../helpers/mocks/monitor').MonitorMock,
    logger = require('../../lib/forever/plugins/logger');

vows.describe('forever/plugins/logger').addBatch({
  'When using `logger` plugin': {
    'with a custom stream': {
      topic: function () {
        var stdoutMock = new StreamMock();
        var stderrMock = new StreamMock();

        var monitorMock = new MonitorMock();
        monitorMock.use(logger, { stdout: stdoutMock, stderr: stderrMock });

        monitorMock.emit('start');

        for (var i = 0; i < 4; i++) {
          monitorMock.child.stdout.emit('data', 'stdout ' + i);
          monitorMock.child.stderr.emit('data', 'stderr ' + i);
        }

        this.callback(null, {
          monitor: monitorMock,
          stdout: stdoutMock,
          stderr: stderrMock
        });
      },
      'should output correct number of lines': function (mocks) {
        assert.deepEqual(
          mocks.stdout.contents,
          ['stdout 0', 'stdout 1', 'stdout 2', 'stdout 3']
        );
        assert.deepEqual(
          mocks.stderr.contents,
          ['stderr 0', 'stderr 1', 'stderr 2', 'stderr 3']
        );
      },
      "after `exit` event": {
        topic: function (mocks) {
          var self = this;

          mocks.monitor.child.emit('exit');
          process.nextTick(function () {
            self.callback(null, mocks);
          });
        },
        "stream shouldn't be closed": function (mocks) {
          assert.isFalse(mocks.stdout.closed);
          assert.isFalse(mocks.stderr.closed);
        }
      }
    }
  }
}).export(module);

