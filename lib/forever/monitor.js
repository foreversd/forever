/*
 * monitor.js: Core functionality for the Monitor object.
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    events = require('events'),
    spawn = require('child_process').spawn,
    winston = require('winston'),
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
  this.forever     = options.forever || false;
  this.uid         = options.uid || forever.randomString(24);
  this.pidFile     = options.pidFile || path.join(forever.config.get('pidPath'), this.uid + '.pid');
  this.max         = options.max;
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
    this.stdout = fs.createWriteStream(this.outFile, { flags: 'a+', encoding: 'utf8', mode: 0666 });
  }

  // If we should log stderr, open a file buffer
  if (this.errFile) {
    this.stderr = fs.createWriteStream(this.errFile, { flags: 'a+', encoding: 'utf8', mode: 0666 });
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
  var self = this;

  if (this.running && !restart) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot start process that is already running.'));
    });
  }
  
  var child = this.trySpawn();
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
  function listenTo (stream) {
    function ldata (data) {
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

    if (self.forceStop || (!self.forever && self.times >= self.max)
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
  var self = this;

  if (!this.running) {
    //
    // TODO: Return settings from this forever instance
    // with a state indicator that it is currently stopped.
    //
    return {};
  }

  var childData = {
    ctime: this.ctime,
    command: this.command,
    file: this.options[0],
    foreverPid: process.pid,
    logFile: this.logFile,
    options: this.options.slice(1),
    pid: this.child.pid,
    silent: this.silent,
    uid: this.uid
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
  var self = this;

  if (!this.child || !this.running) {
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
    if (forceStop) {
      this.forceStop = true;
    }

    this.child.kill();
    this.emit('stop', this.childData);
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

  function addKey (key, source) {
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
