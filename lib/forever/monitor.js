/*
 * monitor.js: Core functionality for the Monitor object.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var events = require('events'),
    fs = require('fs'),
    path = require('path'),
    nodeFork = require('node-fork'),
    fork = nodeFork.fork,
    spawn = require('child_process').spawn,
    broadway = require('broadway'),
    psTree = require('ps-tree'),
    winston = require('winston'),
    utile = require('utile'),
    forever = require('../forever');

//
// ### function Monitor (script, options)
// #### @script {string} Location of the target script to run.
// #### @options {Object} Configuration for this instance.
// Creates a new instance of forever with specified `options`.
//
var Monitor = exports.Monitor = function (script, options) {
  //
  // Simple bootstrapper for attaching logger
  // and watch plugins by default. Other plugins
  // can be attached through `monitor.use(plugin, options)`.
  //
  function bootstrap(monitor) {
    forever.plugins.logger.attach.call(monitor, options);
    if (options.watch) {
      forever.plugins.watch.attach.call(monitor, options);
    }
  }
  
  var self = this;

  //
  // Setup basic configuration options
  //
  options          = options || {};
  this.silent      = options.silent || false;
  this.killTree    = options.killTree !== false;
  this.uid         = options.uid || utile.randomString(4);
  this.pidFile     = options.pidFile || path.join(forever.config.get('pidPath'), this.uid + '.pid');
  this.max         = options.max;
  this.killTTL     = options.killTTL;
  this.childExists = false;
  this.checkFile   = options.checkFile !== false;
  this.times       = 0;
  this.warn        = console.error;

  this.logFile     = options.logFile || path.join(forever.config.get('root'), this.uid + '.log');
  this.outFile     = options.outFile;
  this.errFile     = options.errFile;
  this.append      = options.append;

  //
  // Setup restart timing. These options control how quickly forever restarts
  // a child process as well as when to kill a "spinning" process
  //
  this.minUptime     = typeof options.minUptime !== 'number' ? 0 : options.minUptime;
  this.spinSleepTime = options.spinSleepTime || null;

  //
  // Setup the command to spawn and the options to pass
  // to that command.
  //
  this.command   = options.command || 'node';
  this.args      = options.options || [];
  this.spawnWith = options.spawnWith || {};
  this.sourceDir = options.sourceDir;
  this.fork      = options.fork || false;
  this.forkShim  = options.forkShim || false;
  this.cwd       = options.cwd || null;
  this.hideEnv   = options.hideEnv || [];
  this._env      = options.env || {};
  this._hideEnv  = {};

  //
  // Setup watch configuration options
  //
  this.watchIgnoreDotFiles = options.watchIgnoreDotFiles || true;
  this.watchIgnorePatterns = options.watchIgnorePatterns || [];
  this.watchDirectory      = options.watchDirectory || this.sourceDir;

  //
  // Create a simple mapping of `this.hideEnv` to an easily indexable
  // object
  //
  this.hideEnv.forEach(function (key) {
    self._hideEnv[key] = true;
  });

  if (Array.isArray(script)) {
    this.command = script[0];
    this.args = script.slice(1);
  }
  else {
    this.args.unshift(script);
  }
  
  if (this.sourceDir) {
    this.args[0] = path.join(this.sourceDir, this.args[0]);
  }
  
  //
  // Bootstrap this instance now that options
  // have been set
  //
  broadway.App.call(this, { bootstrapper: { bootstrap: bootstrap } });
};

// Inherit from events.EventEmitter
utile.inherits(Monitor, broadway.App);

//
// ### function start ([restart])
// #### @restart {boolean} Value indicating whether this is a restart.
// Start the process that this instance is configured for
//
Monitor.prototype.start = function (restart) {
  var self = this,
      child;

  if (this.running && !restart) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot start process that is already running.'));
    });
    return this;
  }

  child = this.trySpawn();
  if (!child) {
    process.nextTick(function () {
      self.emit('error', new Error('Target script does not exist: ' + self.args[0]));
    });
    return this;
  }

  this.ctime = Date.now();
  this.child = child;
  this.running = true;
  process.nextTick(function () {
    self.emit(restart ? 'restart' : 'start', self, self.data);
  });

  function onMessage(msg) {
    self.emit('message', msg);
  }

  // Re-emit messages from the child process
  this.child.on('message', onMessage);

  child.on('exit', function (code) {
    var spinning = Date.now() - self.ctime < self.minUptime;
    self.warn('Forever detected script exited with code: ' + code);
    child.removeListener('message', onMessage);

    function letChildDie() {
      self.running = false;
      self.forceStop = false;

      self.emit('exit', self, spinning);
    }

    function restartChild() {
      self.forceRestart = false;
      process.nextTick(function () {
        self.warn('Forever restarting script for ' + self.times + ' time');
        self.start(true);
      });
    }

    self.times++;

    if (self.forceStop || (self.times >= self.max)
      || (spinning && typeof self.spinSleepTime !== 'number') && !self.forceRestart) {
      letChildDie();
    }
    else if (spinning) {
      setTimeout(restartChild, self.spinSleepTime);
    }
    else {
      restartChild();
    }
  });

  return this;
};

//
// ### function trySpawn()
// Tries to spawn the target Forever child process. Depending on
// configuration, it checks the first argument of the options
// to see if the file exists. This is useful is you are
// trying to execute a script with an env: e.g. node myfile.js
//
Monitor.prototype.trySpawn = function () {
  if (this.command === 'node' && this.checkFile && !this.childExists) {
    try {
      var stats = fs.statSync(this.args[0]);
      this.childExists = true;
    }
    catch (ex) {
      return false;
    }
  }

  this.spawnWith.cwd = this.cwd || this.spawnWith.cwd;
  this.spawnWith.env = this._getEnv();

  if (this.fork) {
    this.spawnWith.silent = true;
    this.spawnWith.command = this.command;
    
    if (this.forkShim) {
      if (typeof this.forkShim === 'string') {
        this.spawnWith.forkModule = this.forkShim;
      }
      this.spawnWith.env['FORK_SHIM'] = true;
      return nodeFork.shim.fork(this.args[0], this.args.slice(1), this.spawnWith);
    }
    
    return fork(this.args[0], this.args.slice(1), this.spawnWith);
  }

  return spawn(this.command, this.args, this.spawnWith);
};

//
// ### @data {Object}
// Responds with the appropriate information about
// this `Monitor` instance and it's associated child process.
//
Monitor.prototype.__defineGetter__('data', function () {
  var self = this,
      childData;

  if (!this.running) {
    //
    // TODO: Return settings from this forever instance
    // with a state indicator that it is currently stopped.
    //
    return {};
  }

  childData = {
    ctime: this.ctime,
    command: this.command,
    file: this.args[0],
    foreverPid: process.pid,
    logFile: this.logFile,
    options: this.args.slice(1),
    pid: this.child.pid,
    silent: this.silent,
    uid: this.uid,
    spawnWith: this.spawnWith
  };

  ['pidFile', 'outFile', 'errFile', 'env', 'cwd'].forEach(function (key) {
    if (self[key]) {
      childData[key] = self[key];
    }
  });

  if (this.sourceDir) {
    childData.sourceDir = this.sourceDir;
    childData.file = childData.file.replace(this.sourceDir + '/', '');
  }

  this.childData = childData;
  return this.childData;

  //
  // Setup the forever process to listen to
  // SIGINT and SIGTERM events so that we can
  // clean up the *.pid file
  //
  // Remark: This should work, but the fd gets screwed up
  //         with the daemon process.
  //
  // process.on('SIGINT', function () {
  //   process.exit(0);
  // });
  //
  // process.on('SIGTERM', function () {
  //   process.exit(0);
  // });
  // process.on('exit', function () {
  //   fs.unlinkSync(childPath);
  // });
});

//
// ### function restart ()
// Restarts the target script associated with this instance.
//
Monitor.prototype.restart = function () {
  this.forceRestart = true;
  return this.kill(false);
};

//
// ### function stop ()
// Stops the target script associated with this instance. Prevents it from auto-respawning
//
Monitor.prototype.stop = function () {
  return this.kill(true);
};

//
// ### function kill (forceStop)
// #### @forceStop {boolean} Value indicating whether short circuit forever auto-restart.
// Kills the ChildProcess object associated with this instance.
//
Monitor.prototype.kill = function (forceStop) {
  var self = this,
      child = this.child;

  if (!child || !this.running) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot stop process that is not running.'));
    });
  }
  else {
    //
    // Set an instance variable here to indicate this
    // stoppage is forced so that when `child.on('exit', ..)`
    // fires in `Monitor.prototype.start` we can short circuit
    // and prevent auto-restart
    //
    var toKill = [this.child.pid];
    if (forceStop) {
      this.forceStop = true;
      //
      // If we have a time before we truly kill forcefully, set up a timer
      //
      if (this.killTTL) {
        var timer = setTimeout(function () {
          toKill.forEach(function (pid) {
            try {
              process.kill(pid, 'SIGKILL');
            }
            catch (e) {
              //conditions for races may exist, this is most likely an ESRCH
              //these should be ignored, and then we should emit that it is dead
            }
          });
          
          self.emit('stop', this.childData);
        }, this.killTTL);
        
        child.on('exit', function () {
          clearTimeout(timer);  
        });
      }
    }

    forever.kill(this.child.pid, this.killTree, function () {
      self.emit('stop', self.childData);
    });
  }

  return this;
};

//
// ### @private function _getEnv ()
// Returns the environment variables that should be passed along
// to the target process spawned by this instance.
//
Monitor.prototype._getEnv = function () {
  var self = this,
      merged = {};

  function addKey(key, source) {
    merged[key] = source[key];
  }

  //
  // Mixin the key:value pairs from `process.env` and the custom
  // environment variables in `this._env`.
  //
  Object.keys(process.env).forEach(function (key) {
    if (!self._hideEnv[key]) {
      addKey(key, process.env);
    }
  });

  Object.keys(this._env).forEach(function (key) {
    addKey(key, self._env);
  });

  return merged;
};
