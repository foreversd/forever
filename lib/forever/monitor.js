/*
 * monitor.js: Core functionality for the Monitor object.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    events = require('events'),
    spawn = require('child_process').spawn,
    winston = require('winston'),
    watch = require('watch'),
    minimatch = require('minimatch'),
    psTree = require('ps-tree'),
    utile = require('utile'),
    forever = require('../forever');

//
// ### function Monitor (script, options)
// #### @script {string} Location of the target script to run.
// #### @options {Object} Configuration for this instance.
// Creates a new instance of forever with specified params.
//
var Monitor = exports.Monitor = function (script, options) {
  var self = this;
  events.EventEmitter.call(this);

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
  this.times       = 0;

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
  this.options   = options.options || [];
  this.spawnWith = options.spawnWith || {};
  this.sourceDir = options.sourceDir;
  this.cwd       = options.cwd || null;
  this.env       = options.env || {};
  this.hideEnv   = options.hideEnv || [];
  this._hideEnv  = {};

  //
  // Create a simple mapping of `this.hideEnv` to an easily indexable
  // object
  //
  this.hideEnv.forEach(function (key) {
    self._hideEnv[key] = true;
  });

  //
  // Setup watch configuration options
  //
  this.watchIgnoreDotFiles = options.watchIgnoreDotFiles || true;
  this.watchIgnorePatterns = options.watchIgnorePatterns || [];
  this.watchDirectory      = options.watchDirectory || this.sourceDir;

  if (options.watch) {
    this.watch();
  }

  //
  // Setup log files and logger for this instance.
  //
  this.logFile = options.logFile || path.join(forever.config.get('root'), this.uid + '.log');
  this.outFile = options.outFile;
  this.errFile = options.errFile;
  this.logger  = options.logger || new (winston.Logger)({
    transports: [new winston.transports.Console({ silent: this.silent })]
  });

  //
  // Extend from the winston logger.
  //
  this.logger.extend(this);

  if (Array.isArray(script)) {
    this.command = script[0];
    this.options = script.slice(1);
  }
  else {
    this.options.unshift(script);
  }

  if (this.sourceDir) {
    this.options[0] = path.join(this.sourceDir, this.options[0]);
  }

  // If we should log stdout, open a file buffer
  if (this.outFile) {
    this.stdout = fs.createWriteStream(this.outFile, { flags: 'a+', encoding: 'utf8', mode: '0666' });
  }

  // If we should log stderr, open a file buffer
  if (this.errFile) {
    this.stderr = fs.createWriteStream(this.errFile, { flags: 'a+', encoding: 'utf8', mode: '0666' });
  }

  //
  // Last if any hooks have been passed in attach
  // this instance to them
  //
  if (options.hooks && options.hooks.length > 0) {
    options.hooks.forEach(function (hook) {
      if (typeof hook === 'function') {
        return hook(self);
      }

      hook.attach(self);
    });
  }
};

// Inherit from events.EventEmitter
util.inherits(Monitor, events.EventEmitter);

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
      self.emit('error', new Error('Target script does not exist: ' + self.options[0]));
    });
    return this;
  }

  this.ctime = Date.now();
  this.child = child;
  this.running = true;

  process.nextTick(function () {
    self.emit(restart ? 'restart' : 'start', self, self.data);
  });

  // Hook all stream data and process it
  function listenTo(stream) {
    function ldata(data) {
      if (!self.silent && !self[stream]) {
        //
        // If we haven't been silenced, and we don't have a file stream
        // to output to write to the process stdout stream
        //
        process.stdout.write(data);
      }
      else if (self[stream]) {
        //
        // If we have been given an output file for the stream, write to it
        //
        self[stream].write(data);
      }

      self.emit(stream, data);
    }

    child[stream].on('data', ldata);

    child.on('exit', function () {
      child[stream].removeListener('data', ldata);
    });
  }

  // Listen to stdout and stderr
  listenTo('stdout');
  listenTo('stderr');

  child.on('exit', function (code) {
    var spinning = Date.now() - self.ctime < self.minUptime;
    self.warn('Forever detected script exited with code: ' + code);

    function letChildDie() {
      self.running = false;
      self.forceStop = false;

      //
      // If had to write to an stdout file, close it
      //
      if (self.stdout) {
        self.stdout.end();
      }

      //
      // If had to write to an stderr file, close it
      //
      if (self.stderr) {
        self.stderr.end();
      }

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
  if (this.command === 'node' || (this.checkFile && !this.childExists)) {
    try {
      var stats = fs.statSync(this.options[0]);
      this.childExists = true;
    }
    catch (ex) {
      return false;
    }
  }

  this.spawnWith.cwd = this.cwd || this.spawnWith.cwd;
  this.spawnWith.env = this._getEnv();

  return spawn(this.command, this.options, this.spawnWith);
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
    file: this.options[0],
    foreverPid: process.pid,
    logFile: this.logFile,
    options: this.options.slice(1),
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
          toKill.forEach(function(pid) {
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

    forever.kill(this.child.pid, this.killTree, function() {
      self.emit('stop', self.childData);
    });
  }

  return this;
};

//
// ### function watch ()
// Starts watching directory tree for changes.
//
Monitor.prototype.watch = function () {
  var self = this;

  fs.readFile(path.join(this.watchDirectory, '.foreverignore'), 'utf8', function (err, data) {
    if (err) {
      forever.log.warn('Could not read .foreverignore file.');
      return forever.log.silly(err.message);
    }

    Array.prototype.push.apply(self.watchIgnorePatterns, data.split('\n'));
  });

  watch.watchTree(this.watchDirectory, function (f, curr, prev) {
    if (!(curr === null && prev === null && typeof f === 'object')) {
      //
      // `curr` == null && `prev` == null && typeof f == "object" when watch
      // finishes walking the tree to add listeners. We don't need to know
      // about it, so we simply ignore it (anything different means that
      // some file changed/was removed/created - that's what we want to know).
      //
      if (self._watchFilter(f)) {
        self.info('restaring script because ' + f + ' changed');
        self.restart();
      }
    }
  });
};

//
// ### @private function _watchFilter
// #### @file {string} File name
// Determines whether we should restart if `file` change (@mikeal's filtering
// is pretty messed up).
//
Monitor.prototype._watchFilter = function (fileName) {
  if (this.watchIgnoreDotFiles && path.basename(fileName)[0] === '.') {
    return false;
  }

  for (var key in this.watchIgnorePatterns) {
    if (minimatch(fileName, this.watchIgnorePatterns[key], { matchBase: this.watchDirectory })) {
      return false;
    }
  }

  return true;
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
  // environment variables in `this.env`.
  //
  Object.keys(process.env).forEach(function (key) {
    if (!self._hideEnv[key]) {
      addKey(key, process.env);
    }
  });

  Object.keys(this.env).forEach(function (key) {
    addKey(key, self.env);
  });

  return merged;
};
