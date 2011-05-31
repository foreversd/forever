/*
 * monitor.js: Core functionality for the Monitor object.
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    fs = require('fs'),
    path = require('path'),
    events = require('events'),
    spawn = require('child_process').spawn,
    winston = require('winston'),
    forever = require('forever');

//
// ### function Monitor (script, options)
// #### @script {string} Location of the target script to run.
// #### @options {Object} Configuration for this instance.
// Creates a new instance of forever with specified params.
//
var Monitor = exports.Monitor = function (script, options) {
  events.EventEmitter.call(this);
  
  options            = options || {};
  this.silent        = options.silent || false;
  this.forever       = options.forever || false;
  this.command       = options.command || 'node';
  this.sourceDir     = options.sourceDir;
  this.minUptime     = typeof options.minUptime !== 'number' ? 2000 : options.minUptime;
  this.spinSleepTime = options.spinSleepTime || null;
  this.options       = options.options || [];
  this.spawnWith     = options.spawnWith || null;
  this.uid           = options.uid || forever.randomString(24);
  this.fvrFile       = path.join(forever.config.get('pidPath'), this.uid + '.fvr');
  this.max           = options.max;
  this.logFile       = options.logFile || path.join(forever.config.get('root'), this.uid + '.log');
  this.pidFile       = options.pidFile || path.join(forever.config.get('pidPath'), this.uid + '.pid');
  this.outFile       = options.outFile;
  this.errFile       = options.errFile;
  this.logger        = options.logger || new (winston.Logger)({
    transports: [new winston.transports.Console({ silent: this.silent })]
  });
  
  // Extend from the winston logger.
  this.logger.extend(this);
  
  this.childExists = false;
  
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
  
  this.times = 0;
};

// Inherit from events.EventEmitter
sys.inherits(Monitor, events.EventEmitter);

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
  
  this.once('save', function (file, data) {
    self.emit(restart ? 'restart' : 'start', self, file, data);
  });
  
  this.save();
  
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

      // If had to write to an stdout file, close it
      if (self.stdout) self.stdout.end();
      // If had to write to an stderr file, close it
      if (self.stderr) self.stderr.end();
      
      fs.unlink(self.fvrFile, function () {
        self.emit('exit', self, spinning);
      });
    }

    function restartChild() {
      self.times++;
      process.nextTick(function () {
        self.warn('Forever restarting script for ' + self.times + ' time');
        self.start(true);
      });
    }

    if (self.forceStop) {
      letChildDie();
    }
    else if(spinning && typeof self.spinSleepTime !== 'number') {
      letChildDie();
    }
    else if (!self.forever && self.times >= self.max) {
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

  return spawn(this.command, this.options, this.spawnWith);
};

//
// ### function save ()
// Persists this instance of forever to disk.
//
Monitor.prototype.save = function () {
  var self = this;
  if (!this.running) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot save Forever instance that is not running'));
    });
  }
  
  var childData = {
    uid: this.uid,
    ctime: this.ctime,
    command: this.command,
    pid: this.child.pid,
    foreverPid: process.pid,
    logFile: this.logFile,
    options: this.options.slice(1),
    file: this.options[0]
  };
  
  this.childData = childData;
  if (this.pidFile) childData.pidFile = this.pidFile;
  if (this.outFile) childData.outFile = this.outFile;
  if (this.errFile) childData.errFile = this.errFile;
  if (this.sourceDir) {
    childData.sourceDir = this.sourceDir;
    childData.file = childData.file.replace(this.sourceDir + '/', '');
  }
  
  fs.writeFile(this.fvrFile, JSON.stringify(childData, null, 2), function (err) {
    return err ? self.emit('error', err) : self.emit('save', self.fvrFile, childData);
  });
  
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
  
  return this;
};

//
// ### function restart ()
// Restarts the target script associated with this instance.
//
Monitor.prototype.restart = function () {
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
