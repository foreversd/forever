/*
 * monitor.js: Core functionality for the Monitor object.
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    fs = require('fs'),
    events = require('events'),
    spawn = require('child_process').spawn,
    forever = require('forever');

//
// ### function Monitor (script, options)
// #### @script {string} Location of the target script to run.
// #### @options {Object} Configuration for this instance.
// Creates a new instance of forever with specified params.
//
var Monitor = exports.Monitor = function (script, options) {
  events.EventEmitter.call(this);
  
  this.silent  = options.silent || false;
  this.forever = options.forever || false;
  this.command = options.command || 'node';
  this.options = options.options || [];
  this.max     = options.max;
  this.logFile = options.logFile;
  this.pidFile = options.pidFile;
  this.outFile = options.outFile;
  this.errFile = options.errFile;
  
  this.childExists = false;
  
  if (Array.isArray(script)) {
    this.command = script[0];
    this.options = script.slice(1);
  }
  else {
    this.options.unshift(script);
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
  
  this.child = child;
  this.running = true;
  self.emit(restart ? 'restart' : 'start', self);
  
  // Hook all stream data and process it
  function listenTo (stream) {
    child[stream].on('data', function (data) {
      if (!self.silent && !self[stream]) {
        // If we haven't been silenced, and we don't have a file stream
        // to output to write to the process stdout stream
        process.stdout.write(data);
      }
      else if (self[stream]) {
        // If we have been given an output file for the stream, write to it
        self[stream].write(data);
      }
      
      self.emit(stream, data);
    });
  }
  
  // Listen to stdout and stderr
  listenTo('stdout');
  listenTo('stderr');
    
  child.on('exit', function (code) {
    self.log('Forever detected script exited with code: ' + code);
    self.times++;

    if (self.forever || self.times < self.max) {
      process.nextTick(function () {
        self.log('Forever restarting script for ' + self.times + ' time');
        self.start(true);
      });
    }
    else {
      this.running = false;
      
      // If had to write to an stdout file, close it
      if (self.stdout) self.stdout.end();
      // If had to write to an stderr file, close it
      if (self.stderr) self.stderr.end();
      
      self.emit('exit', self);
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
  
  return spawn(this.command, this.options);
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
  
  var childPath = path.join(forever.config.pidPath, childData.foreverPid + '.fvr');
  fs.writeFile(childPath, JSON.stringify(childData), function (err) {
    if (err) self.emit('error', err);
    self.emit('save', childPath, childData);
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
// ### function log (message)
// #### @message {string} String to log.
// Utility function for logging forever actions
//
Monitor.prototype.log = function (message) {
  if (!this.silent) {
    sys.puts(message);
  }
  return this;
};

//
// ### function stop ()
// Stops the target script associated with this instance.
//
Monitor.prototype.stop = function () {
  if (!this.child || !this.running) {
    var self = this;
    process.nextTick(function () {
      self.emit('error', new Error('Cannot stop process that is not running.'));
    });
  }
  else {
    this.child.kill();
    this.emit('stop', this.childData)
  }
  
  return this;
};