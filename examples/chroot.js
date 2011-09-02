var util = require('util'),
    daemon = require('daemon'),
    fs = require('fs');

daemon.chroot('/tmp/chroot');
util.puts('Working in chroot');

setInterval(function () {
  fs.readdir('./', function (err, files) {
    util.puts('Current directory: ' + process.cwd());
    util.puts('err: ' + util.inspect(err));
    util.puts('files: ' + util.inspect(files));
  });
}, 10000 );
