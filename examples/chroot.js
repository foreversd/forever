var sys = require('sys'),
    daemon = require('daemon'),
    fs = require('fs');

daemon.chroot('/tmp/chroot');
sys.puts('Working in chroot');

setInterval(function () {
  fs.readdir('./', function (err, files) {
    sys.puts('Current directory: ' + process.cwd());
    sys.puts('err: ' + sys.inspect(err));
    sys.puts('files: ' + sys.inspect(files));
  });
}, 10000 );