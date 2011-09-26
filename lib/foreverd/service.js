var forever = require('../forever');
// options
//   directories {log, pid, conf, run, local}
function ForeverService(options) {
    EventEmitter2.call(this);
    var self = this;
    this.applications = [
        //{
        //file:
        //options:
        //monitor:
        //}
    ];
    this.adapter = new (options.adapter || SystemVAdapter)(this);
    this.adapter.load(function onLoaded(applications) {
        applications.forEach(function startApplication(application) {
            var monitor = application.monitor = new forever.Monitor(application.file, application.options);
            monitor.start();
            self.applications.push(application);
            if(index === applications.length - 1) {
              self.listen(path.join(forever.config('root'),'foreverd.sock'));
            }
            self.emit('foreverd::loaded')
        });
    });
    this.on('foreverd::add', function addEventHandler(file, options, callback) {
        this.add(file, options, callback);
    });
    this.on('foreverd::remove', function removeEventHandler(file, options, callback) {
        this.remove(file, options, callback);    
    });
    this.on('foreverd::start', function startEventHandler(callback) {
        this.start(callback); 
    });
    this.on('foreverd::stop', function stopEventHandler(callback) {
        this.stop(callback);
    });
    this.on('foreverd::restart', function restartEventHandler(callback) {
        this.restart(callback);
    });
    this.on('foreverd::list', function restartEventHandler(query, callback) {
        this.search(query, callback);
    });
}
util.inherits(ForeverService, EventEmitter2);

ForeverService.prototype.startServer = function startServer(callback) {
    var socket = path.join(forever.config.get('sockPath'), 'forever.sock'),
      monitors = [],
      server;
  
  server = dnode(this);
  portfinder.getSocket({ path: socket }, function onSocketFound(err, socket) {
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
    this.server.push(dnodeServer);
    dnodeServer.listen(server);
    return this;
}

//
// Function add(file, options)
//   add the application to the service manager
//   DOES NOT START THE APPLICATION
//   call's the service manager's add method
//
ForeverService.prototype.add = function add(file, options, callback) {
    if (this.paused) {
        return callback(new Error('foreverd is paused'));
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
    callback();
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
//   creates monitors for all the services
//
ForeverService.prototype.start = function start(callback) {
    this.adapter.start(function adapterStarted() {
        this.applications.forEach(function startApplication(application) {
            application.monitor.start();
        });
        callback();
    });
    return this;
}

//
// Function stop(monitors)
//
ForeverService.prototype.stop = function stop(callback) {
    this.adapter.start(function adapterStopped() {
        this.applications.forEach(function stopApplication(application) {
            application.monitor.stop();
        });
        callback();
    });
    return this;
}

//
// Function restart()
//
ForeverService.prototype.restart = function restart(callback) {
    this.adapter.start(function adapterRestarted() {
        this.applications.forEach(function restartApplication(application) {
            application.monitor.restart();
        });
        callback();
    });
    return this;
}

//
// Function pause()
//   disables adding / removing applications
//
ForeverService.prototype.pause = function pause(callback) {
    this.paused = true;
    callback();
    return this;
}

//
// Function resume()
//   reenables adding / removing applications
//
ForeverService.prototype.resume = function resume(callback) {
    this.paused = false;
    callback();
    return this;
}