
var fs = require('fs');

exports.name = 'logger';

exports.attach = function (options) {
  options = options || {};
  var monitor = this;

  monitor.on('start', function startLogs(child, childData) {
    if (monitor.child && !monitor.silent) {
      monitor.child.stdout.pipe(process.stdout);
      monitor.child.stderr.pipe(process.stderr);
      if (monitor.outFile) {
        monitor.stdout = fs.createWriteStream(monitor.outFile, {
          flags: monitor.append ? 'a+' : 'w+',
          encoding: 'utf8',
          mode: 0644
        });
        monitor.child.stdout.pipe(monitor.stdout);
      }
      if (monitor.errFile) {
        monitor.stderr = fs.createWriteStream(monitor.errFile, {
          flags: monitor.append ? 'a+' : 'w+',
          encoding: 'utf8',
          mode: 0644
        });
        monitor.child.stderr.pipe(monitor.stderr);
      }
    }
  });

};


