var assert = require('assert'),
    fs = require('fs'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../../lib/forever');

var fixturesDir = path.join(__dirname, '..', 'fixtures');

function checkLogOutput(file, stream, expectedLength) {
  var output = fs.readFileSync(path.join(fixturesDir, file), 'utf8'),
      lines = output.split('\n').slice(0, -1);

  assert.equal(lines.length, expectedLength);
  lines.forEach(function (line, i) {
    assert.equal(lines[i], stream + ' ' + (i % 10));
  });
}

vows.describe('forever/plugins/logger').addBatch({
  'When using the logger plugin': {
    'with custom log files': {
      topic: function () {
        var outlogs, errlogs, monitor;

        monitor = new forever.Monitor(path.join(fixturesDir, 'logs.js'), {
          max: 1,
          silent: true,
          outFile: path.join(fixturesDir, 'logs-stdout.log'),
          errFile: path.join(fixturesDir, 'logs-stderr.log')
        });

        monitor.on('exit', this.callback.bind({}, null));
        monitor.start();
      },
      'log files should contain correct output': function (err) {
        checkLogOutput('logs-stdout.log', 'stdout', 10);
        checkLogOutput('logs-stderr.log', 'stderr', 10);
      }
    },
    'with custom log files and a process that exits': {
      topic: function () {
        var monitor = new forever.Monitor(path.join(fixturesDir, 'logs.js'), {
          max: 5,
          silent: true,
          outFile: path.join(fixturesDir, 'logs-stdout-2.log'),
          errFile: path.join(fixturesDir, 'logs-stderr-2.log')
        });

        monitor.on('exit', this.callback.bind({}, null));
        monitor.start();
      },
      'logging should continue through process restarts': function (err) {
        checkLogOutput('logs-stdout-2.log', 'stdout', 50);
        checkLogOutput('logs-stderr-2.log', 'stderr', 50);
      }
    },
  }
}).addBatch({
  'When using the logger plugin': {
    'with custom log files and the append option set': {
      topic: function () {
        var monitor = new forever.Monitor(path.join(fixturesDir, 'logs.js'), {
          max: 3,
          silent: true,
          append: true,
          outFile: path.join(fixturesDir, 'logs-stdout.log'),
          errFile: path.join(fixturesDir, 'logs-stderr.log')
        });

        monitor.on('exit', this.callback.bind({}, null));
        monitor.start();
      },
      'log files should not be truncated': function (err) {
        checkLogOutput('logs-stdout.log', 'stdout', 40);
        checkLogOutput('logs-stderr.log', 'stderr', 40);
      }
    }
  }
}).export(module);

