
var fs = require('fs');

exports.name = 'logger';

exports.attach = function (options) {
  options = options || {};
  var monitor = this;


  if (options.outFile) {
    monitor.stdout = options.stdout || fs.createWriteStream(options.outFile, {
      flags: monitor.append ? 'a+' : 'w+',
      encoding: 'utf8',
      mode: 0644
    });
  }

  if (options.errFile) {
    monitor.stderr = options.stderr || fs.createWriteStream(options.errFile, {
      flags: monitor.append ? 'a+' : 'w+',
      encoding: 'utf8',
      mode: 0644
    });
  }

  monitor.on('start', startLogs);

  monitor.on('restart', startLogs);

  monitor.on('exit', function () {
    monitor.stdout.end();
    monitor.stderr.end();
  });

  function startLogs(child, childData) {
    if (monitor.child && !monitor.silent) {
      monitor.child.stdout.pipe(process.stdout, { end: false });
      monitor.child.stderr.pipe(process.stderr, { end: false });
      if (monitor.stdout) {
        monitor.child.stdout.pipe(monitor.stdout, { end: false });
      }
      if (monitor.stderr) {
        monitor.child.stderr.pipe(monitor.stderr, { end: false });
      }
    }
  }
};


