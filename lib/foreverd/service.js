var util = require('util');
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var SystemVAdapter = require('./adapter/systemv')
var forever = require('../forever');
var path = require('path');
var fs = require('fs');
var dnode = require('dnode');
var portfinder = require('portfinder')

module.exports = ForeverService;

// options
//   directories {log, pid, conf, run, local}
function ForeverService(options) {
    EventEmitter2.call(this);
    options = options || {};
    var self = this;
    this.applications = [
        //{
        //file:
        //options:
        //monitor:
        //}
    ];
    this.servers = [];
    if(typeof options.adapter == 'string') {
        options.adapter = ForeverService.adapter[options.adapter];
    }
    var AdapterType = options.adapter || SystemVAdapter;
    this.adapter = new AdapterType(this);
    console.log(this.adapter)
}
util.inherits(ForeverService, EventEmitter2);

fs.readdirSync(path.join(__dirname, 'adapter')).forEach(function loadAdapter(adapterModule) {
    ForeverService[adapterModule] = require(path.join(__dirname, 'adapter', adapterModule));
});

ForeverService.prototype.startServer = function startServer(callback) {
    var socket = path.join(forever.config.get('sockPath'), 'forever.sock'),
      monitors = [],
      server;
  console.log('SS')
  server = dnode(this);
  var self = this;
  portfinder.getSocket({ path: socket }, function onSocketFound(err, socket) {
    console.error(arguments)
    if (err) {
      return callback(err);
    }

    server.on('error', function onServerError() {
      //
      // TODO: This is really bad.
      //
    });
    
    server.on('ready', function onServerReady(err) {
      self.listen(server);
      if (callback) {
        if (err) {
          callback(err);
        }
        else {
          callback(null, server, socket);
        }
      }
    });
    
    server.listen(socket);
  });
  return this;
};

ForeverService.prototype.listen = function listen(server) {
    var dnodeServer = dnode(this);
    this.servers.push(dnodeServer);
    dnodeServer.listen(server);
    setTimeout(function(){console.error(dnodeServer)},10000)
    return this;
}

ForeverService.prototype.load = function load() {
    var self = this;
    this.adapter.load(function onLoaded(applications) {
        console.error(arguments)
        applications.forEach(function startApplication(application, index) {
            var monitor = application.monitor = new forever.Monitor(application.file, application.options);
            monitor.start();
            self.applications.push(application);
            if(index === applications.length - 1) {
              self.listen(path.join(forever.config.get('root'),'foreverd.sock'));
            }
            self.emit('foreverd::loaded')
        });
    });
    return this;
}

//
// Function add(file, options)
//   add the application to the service manager
//   DOES NOT START THE APPLICATION
//   call's the service manager's add method
//
ForeverService.prototype.add = function add(file, options, callback) {
    console.log(arguments)
    if (this.paused) {
        return callabck && callback(new Error('foreverd is paused'));
    }
    this.adapter.add(file, options, callback);
}

//
// Function remove(file, options)
//   remove the application from the service manager
//   call's the service manager's remove method
//
ForeverService.prototype.remove = function remove(file, options, callback) {
    if (this.paused) {
        return callback(new Error('foreverd is paused'));
    }
    var applicationsToRemove = this.applications;
    if (file) {
        var fileStr = JSON.stringify(file);
        applicationsToRemove = applicationsToRemove.filter(function compareFile(application) {
            return fileStr !== JSON.stringify(application.file);
        });
    }
    if (options) {
        var optionStr = JSON.stringify(options);
        applicationsToRemove = applicationsToRemove.filter(function compareOptions(application) {
            return optionStr !== JSON.stringify(application.options);
        });
    }
    var self = this;
    applicationsToRemove.forEach(function removeApplication(application) {
        if (application.monitor) {
            application.monitor.stop();
        }
        self.applications.splice(self.applications.indexOf(application), 1);
    });
    callback && callback();
    return this;
}

//
// Function install()
//   installs all the required to run foreverd
//   call's the service manager's install(options)
//

ForeverService.prototype.install = function install(callback) {
    this.adapter.install(callback);
    return this;
}

//
// Function uninstall(options)
//   uninstalls all the required to run foreverd
//   call's the service manager's uninstall(options)
//

ForeverService.prototype.uninstall = function uninstall(callback) {
    this.adapter.uninstall(callback);
    return this;
}

//
// Function start()
//   calls the appropriate OS functionality to start this service
//
ForeverService.prototype.start = function start(callback) {
    this.adapter.start(callback);
    return this;
}

//
// Function run()
//   creates monitors for all the services
//
ForeverService.prototype.run = function run(callback) {
    var self = this;
    this.adapter.run(function adapterStarted() {
        console.error(self.applications)
        self.applications.forEach(function startApplication(application) {
            console.error(application)
            application.monitor = new forever.Monitor(application.file, application.options);
            application.monitor.start();
        });
        callback && callback();
    });
    return this;
}

//
// Function stop(monitors)
//
ForeverService.prototype.stop = function stop(callback) {
    var self = this;
    this.adapter.start(function adapterStopped() {
        self.applications.forEach(function stopApplication(application) {
            application.monitor.stop();
        });
        callback && callback();
    });
    return this;
}

//
// Function restart()
//
ForeverService.prototype.restart = function restart(callback) {
    var self = this;
    this.adapter.start(function adapterRestarted() {
        self.applications.forEach(function restartApplication(application) {
            application.monitor.restart();
        });
        callback && callback();
    });
    return this;
}

//
// Function pause()
//   disables adding / removing applications
//
ForeverService.prototype.pause = function pause(callback) {
    this.paused = true;
    callback && callback();
    return this;
}

//
// Function resume()
//   reenables adding / removing applications
//
ForeverService.prototype.resume = function resume(callback) {
    this.paused = false;
    callback && callback();
    return this;
}

ForeverService.prototype.list = function list(callback) {
    this.adapter.list(callback);
    return this;
}