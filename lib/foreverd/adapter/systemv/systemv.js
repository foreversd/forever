var util = require('util');
var forever = require('../../../forever');
var ForeverServiceAdapter = require('../adapter');

//
// Classic init.d script adapter
// Sometimes called inittab, but its origin is called systemv
//
function SystemVAdapter(service) {
    ForeverServiceAdapter.call(this);
    this.daemonized = false;
}
util.inherits(SystemVAdapter, ForeverServiceAdapter);

SystemVAdapter.prototype.install = function install(callback) {
  //
  // Copy the init.d script to the right location
  // TODO Distribution fixes?
  //
  forever.config.set('root', path.join('/var', 'local', 'foreverd'));
  var initdPath = path.join('/etc', 'init.d', 'foreverd');
  try {
    fs.mkdirSync(forever.config.get('root'), 0777);
    fs.mkdirSync(path.join(forever.config.get('root'), 'services'), 0777);
    var script = fs.createReadStream(path.join(__dirname, 'foreverd'));
    var target = fs.createWriteStream(initdPath, {
      flags: 'w',
      mode: 0777
    });
  }
  catch (e) {
    if (e.code !== 'EEXIST') {
      return callback(e);
    }
  }
  script.pipe(target);
  script.on('end', function() {
    forever.log.info('Adding init.d script to run levels');
    try {
      var directories = fs.readdirSync('/etc');
      directories.forEach(function (directory) {
        var match = directory.match(/^rc(\d+)\.d$/);
        if(match) {
          var kill_or_start = {0:true, 1:true, 6:true}[match[1]] ? 'K' : 'S';
          fs.symlinkSync(initdPath, path.join('/etc',directory,kill_or_start+'20foreverd'));
        }
      });
    }
    catch (e) {
      if (e.code !== 'EEXIST') {
        return callback(e);
      }
    }
  });
}

SystemVAdapter.prototype.start = function start(callback) {
  if(this.daemonized) {
    return callback();
  }
  var self = this;
  var pidFilePath = path.join('/var','run', 'foreverd.pid');
  var logFilePath = path.join('/var','log','foreverd');
  process.on('exit', function removePIDFile() {
    try{
      fs.unlinkSync(pidFilePath);
    }
    catch(err) {
      //we are exiting anyway. this may have some noexist error already
    }
  })
  fs.open(logFilePath, 'w+', function serviceLogOpened(err, logFile) {
    if(err) {
      throw err;
    }
    try {
        daemon.start(logFile);
        daemon.lock(pidFilePath);
    }
    catch (err) {
        return callback(err);
    }
    self.daemonized = true;
    callback();
  });
}
//
//
//
SystemVAdapter.prototype.load = function load(callback) {
    forever.config.set('root', path.join('/var', 'local', 'foreverd'));
    var serviceFiles = fs.readdirSync(path.join(forever.config.get('root'), 'services'));
    var services = [];
    if (serviceFiles.length !== 0) {
        serviceFiles.forEach(function loadServiceFiles(serviceFile, index) {
          var serviceFilePath = path.join(forever.config.get('root'), 'services', serviceFile);
          var service = JSON.parse(fs.readFileSync(serviceFilePath));
          var file = service.file;
          var options = service.options;
          options.minUptime = 200;
          services.push({
            file:service.file,
            options:service.options
          })
        });
    }
    callback(services);
}

SystemVAdapter.prototype.add = function add(file, options, callback) {
  //
  // Add descriptor to our service list
  // this is just a json file in $root/services/*.json
  //
  var service = {
    file: file,
    options: options || {}
  };
  options.appendLog = true;
  var filePath = path.join(forever.config.get('root'), 'services', options.uid + '.json');
  fs.writeFile(filePath, JSON.stringify(service), callback);
}