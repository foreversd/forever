/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    fs = require('fs'),
    colors = require('colors'),
    path = require('path'),
    events = require('events'),
    exec = require('child_process').exec,
    spawn = require('child_process').spawn,
    daemon = require('daemon');

var forever = exports, config;

forever.version = [0, 3, 1];

//
// function load (options, [callback])
//   Initializes configuration for forever module
//
forever.load = function (options, callback) {
  var emitter = new events.EventEmitter();
  options         = options || {};
  options.root    = options.root || path.join('/tmp', 'forever'),
  options.pidPath = options.pidPath || path.join(options.root, 'pids');
  forever.config  = config = options;
  
  // Create the two directories, ignoring errors
  fs.mkdir(config.root, 0755, function (err) { 
    fs.mkdir(config.pidPath, 0755, function (err2) { 
      if (callback) callback();
      emitter.emit('load');
    });
  });
  
  return emitter;
};

//
// function stat (logFile, script, callback)
//   Ensures that the logFile doesn't exist and that
//   the target script does exist before executing callback.
//
forever.stat = function (logFile, script, callback) {
  fs.stat(logFile, function (err, stats) {
    if (!err) return callback(new Error('log file ' + logFile + ' exists.'));
    fs.stat(script, function (err, stats) {
      if (err) return callback(new Error('script ' + script + ' does not exist.'));
      callback(null);
    });
  });
};

//
// function start (file, options) 
//   Starts a script with forever
//   [file]:    Location of the node script to run.
//   [options]: Configuration for forever instance.
//
forever.start = function (file, options) {
  return new Forever(file, options).start();
};

//
// function startDaemon (file, options)
//   Starts a script with forever as a daemon
//   [file]:    Location of the node script to run.
//   [options]: Configuration for forever instance.
//
forever.startDaemon = function (file, options) {
  options.logFile = path.join(config.root, options.logFile || 'forever.log');
  options.pidFile = path.join(config.pidPath, options.pidFile);
  var runner = new Forever(file, options);

  daemon.daemonize(options.logFile, options.pidFile, function (err, pid) {
    if (err) return runner.emit('error', err);
    
    //
    // Remark: This should work, but the fd gets screwed up 
    //         with the daemon process.
    //
    // process.on('exit', function () {
    //   fs.unlinkSync(options.pidFile);
    // });
    
    process.pid = pid;
    runner.start().save().on('restart', function (fvr) { fvr.save() });
  });
  
  return runner;
};

//
// function stop (target, [format])
//   Stops the process with the specified index or
//   script name in the list of all processes
//
forever.stop = function (target, format) {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses(),
      results = [];
  
  var procs = /(\d+)/.test(target) ? forever.findByIndex(target, processes)
                                   : forever.findByScript(target, processes);
  
  if (procs && procs.length > 0) {
    procs.forEach(function (proc) {
      process.kill(proc.foreverPid);
      process.kill(proc.pid);
    });
    
    process.nextTick(function () {
      emitter.emit('stop', format ? forever.list(true, procs) : procs);
    });
  }
  else {
    process.nextTick(function () {
      emitter.emit('error', new Error('Cannot find forever process: ' + target));
    });
  }
  
  return emitter;
};

//
// function findByIndex (index, processes)
//   Finds the process with the specified index.
//
forever.findByIndex = function (index, processes) {
  return processes && [processes[parseInt(index)]];
};

//
// function findByScript (script, processes)
//   Finds the process with the specified script name.
//
forever.findByScript = function (script, processes) {
  return processes.filter(function (p) { return p.file === script });
};

//
// function stopAll (format) 
//   Stops all forever processes
//   [format]: Value indicating if we should format output
//
forever.stopAll = function (format) {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses() || [],
      pids = getAllPids(processes);

  if (format) {
    processes = forever.list(format, processes);
  }    
  
  if (pids && processes) {
    var fPids = pids.map(function (pid) { return pid.foreverPid }),
        cPids = pids.map(function (pid) { return pid.pid });
    
    fPids.concat(cPids).forEach(function (pid) {
      process.kill(pid);
    });
    
    process.nextTick(function () {
      emitter.emit('stopAll', processes);
    });
  }
  else {
    process.nextTick(function () {
      emitter.emit('stopAll', null);
    });
  }
  
  return emitter;
};

//
// function list (format) 
//   Returns the list of all process data managed by forever.
//   [format]: If set, will return a formatted string of data
//
forever.list = function (format, procs) {
  var formatted = [], procs = procs || getAllProcesses();
  if (!procs) return null;
  
  if (format) {
    var index = 0, maxLen = 0;
    // Iterate over the procs to see which has the longest options string
    procs.forEach(function (proc) {
      proc.length = [proc.file].concat(proc.options).join(' ').length;
      if (proc.length > maxLen) maxLen = proc.length;
    });
    
    procs.forEach(function (proc) {
      // Create padding string to keep output aligned
      var padding = new Array(maxLen - proc.length + 1).join(' ');
      formatted.push(formatProcess(proc, index, padding));
      index++;
    });
  }
  
  return format ? formatted.join('\n') : procs;
};

//
// function cleanUp () 
//   Utility function for removing excess pid and 
//   config files used by forever.
//
forever.cleanUp = function (cleanLogs) {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses(true);
  
  if (cleanLogs) forever.cleanLogsSync(processes);
 
  if (processes && processes.length > 0) {
    var checked = 0;
    processes.forEach(function (proc) {
      checkProcess(proc.pid, function (child) {
        checkProcess(proc.foreverPid, function (manager) {
          if (!child && !manager || proc.dead) {
            if (proc.pidFile) {
              fs.unlink(proc.pidFile, function () {
                // Ignore errors
              });
            }
            
            fs.unlink(path.join(config.pidPath, proc.foreverPid + '.fvr'), function () {
              // Ignore errors
            });
            
            if (cleanLogs) {
              fs.unlink(proc.logFile, function () { /* Ignore Errors */ });
            }
          }
          
          checked++;
          if (checked === processes.length) {
            emitter.emit('cleanUp');
          }
        });
      });
    });
  }
  else {
    process.nextTick(function () {
      emitter.emit('cleanUp');
    });
  }
  
  return emitter;
};

//
// function cleanLogsSync (processes)
//   Removes all log files from the root forever directory
//   that do not belong to current running forever processes.
//   [processes]: The set of all forever processes
//
forever.cleanLogsSync = function (processes) {
  var files = fs.readdirSync(config.root),
      runningLogs = processes && processes.map(function (p) { return p.logFile.split('/').pop() });
  
  files.forEach(function (file) {
    if (/\.log$/.test(file) && (!runningLogs || runningLogs.indexOf(file) === -1)) {
      fs.unlinkSync(path.join(config.root, file));
    }
  });
};

//
// function randomString (bits)
//   randomString returns a pseude-random ASCII string which contains at least 
//   the specified number of bits of entropy the return value is a string of 
//   length ⌈bits/6⌉ of characters from the base64 alphabet.
//
forever.randomString = function (bits) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-+', 
      rand, i, ret = '';
  
  //
  // in v8, Math.random() yields 32 pseudo-random bits (in spidermonkey it gives 53)
  //
  while (bits > 0) {
    rand = Math.floor(Math.random()*0x100000000) // 32-bit integer
    // base 64 means 6 bits per character, so we use the top 30 bits from rand to give 30/6=5 characters.
    for (i=26; i>0 && bits>0; i-=6, bits-=6) { 
      ret+=chars[0x3F & rand >>> i];
    }
  }
  return ret;
};

//
// function checkProcess (pid, callback) 
//   Utility function to check to see if a pid is running
//
function checkProcess (pid, callback) {
  exec('ps ' + pid + ' | grep -v PID', function (err, stdout, stderr) {
    if (err) return callback(false);
    callback(stdout.indexOf(pid) !== -1);
  });
};

//
// function formatProcess (index, padding) 
//   Returns a formatted string for the process (proc) at
//   the specified index. 
//   [proc]:    Process to format
//   [index]:   Index of the process in the set of all processes
//   [padding]: Padding to add to the formatted output 
//
function formatProcess (proc, index, padding) {
  // Create an array of the output we can later join
  return ['  [' + index + ']', proc.file.green]
    .concat(proc.options.map(function (opt) { return opt.green }))
    .concat([padding + '[' + proc.pid + ',', proc.foreverPid + ']'])
    .concat(proc.logFile.magenta)
    .join(' ');
};

//
// function getAllProcess ([findDead])
//   Returns all data for processes managed by forever
//   [findDead]: Optional parameter that indicates to return dead procs
//
function getAllProcesses (findDead) {
  var results = [], processes = {},
      files = fs.readdirSync(config.pidPath);
  
  if (files.length === 0) return null;
  
  files.forEach(function (file) {
    try {
      var fullPath = path.join(config.pidPath, file),
          data = fs.readFileSync(fullPath).toString();

      switch (file.match(/\.(\w{3})$/)[1]) {
        case 'pid':
          var pid = parseInt(data);
          if (!processes[pid]) processes[pid] = { foreverPid: pid };
          break;

        case 'fvr':
          var child = JSON.parse(data);
          processes[child.foreverPid] = child;
          break;
      }
    }
    catch (ex) {
      // Ignore errors 
    }
  });
  
  Object.keys(processes).forEach(function (key) {
    if (!processes[key].pid && !findDead) return;
    else if (!processes[key].pid) processes[key].dead = true;
    results.push(processes[key]);
  });
  
  return results;
};

//
// function getAllPids ()
//   Returns the set of all pids managed by forever. 
//   e.x. [{ pid: 12345, foreverPid: 12346 }, ...]
//
function getAllPids (processes) {
  processes = processes || getAllProcesses();
  if (processes) {
    return processes.map(function (proc) {
      return {
        pid: proc.pid,
        foreverPid: proc.foreverPid
      }
    });
  }
  
  return null;
};

//
// Forever (file, options)
//   Creates a new instance of forever with specified params.
//   [file]:    Location of the node script to run.
//   [options]: Configuration for this instance.
//
var Forever = function (file, options) {
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
  
  if (Array.isArray(file)) {
    this.command = file[0];
    this.options = file.slice(1);
  }
  else {
    this.options.unshift(file);
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
sys.inherits(Forever, events.EventEmitter);

//
// function start () 
//   Start the process that this instance is configured for
//
Forever.prototype.start = function (restart) {
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
// function trySpawn() 
//   Tries to spawn the target Forever child process. Depending on
//   configuration, it checks the first argument of the options
//   to see if the file exists. This is useful is you are
//   trying to execute a script with an env: e.g. node myfile.js
//
Forever.prototype.trySpawn = function () {
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
// function save ()
//   Persists this instance of forever to disk.
//
Forever.prototype.save = function () {
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
  
  var childPath = path.join(config.pidPath, childData.foreverPid + '.fvr');
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
// function log (message)
//   Utility function for logging forever actions
//
Forever.prototype.log = function (message) {
  if (!this.silent) {
    sys.puts(message);
  }
  return this;
};

//
// function stop ()
//   Stops this instance of forever
//
Forever.prototype.stop = function () {
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

// Export the Forever object
forever.Forever = Forever;
