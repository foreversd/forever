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
    eyes = require('eyes'),
    path = require('path'),
    events = require('events'),
    exec = require('child_process').exec,
    spawn = require('child_process').spawn,
    daemon = require('daemon');

var forever = exports, config;

//
// function load ()
//   Initializes configuration for forever module
//
forever.load = function (options, callback) {
  var emitter = new events.EventEmitter();
  options = options || {};
  options.root    = options.root || path.join('/tmp', 'forever'),
  options.pidPath = options.pidPath || path.join(options.root, 'pids');
  config = options;
  
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
  
  fs.open(options.logFile, 'w+', function (err, fd) {
    try {
      var pid = daemon.start(fd);
      daemon.lock(options.pidFile);
      process.pid = pid;
      
      //
      // Remark: This should work, but the fd gets screwed up 
      //         with the daemon process.
      //
      // process.on('exit', function () {
      //   fs.unlinkSync(options.pidFile);
      // });
      
      runner.start().save();
    }
    catch (ex) {
      runner.emit('error', ex);
    }
  });
  
  return runner;
};

//
// function stop (index)
//   Stops the process with the specified 
//   index in the list of all processes
//
forever.stop = function (index, format) {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses(),
      proc = processes && processes[index];
  
  if (proc) {
    exec('kill ' + proc.foreverPid, function () {
      exec('kill ' + proc.pid, function () {
        if (format) proc = formatProcess(proc, index, '');
        emitter.emit('stop', proc);
      });
    });
  }
  else {
    process.nextTick(function () {
      emitter.emit('error', new Error('Cannot find forever process with index: ' + index));
    });
  }
  
  return emitter;
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
    var fPids = pids.map(function (pid) { return pid.foreverPid }).join(' '),
        cPids = pids.map(function (pid) { return pid.pid }).join(' ');
        
    exec('kill ' + fPids, function () {
      exec('kill ' + cPids, function () {
        emitter.emit('stopAll', processes);
      });
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
forever.cleanUp = function () {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses();
  
  if (processes) {
    var checked = 0;
    processes.forEach(function (proc) {
      checkProcess(proc.pid, function (child) {
        checkProcess(proc.foreverPid, function (manager) {
          if (!child && !manager) {
            if (proc.pidFile) {
              fs.unlink(proc.pidFile, function () {
                // Ignore errors
              });
            }
            
            fs.unlink(path.join(config.pidPath, proc.foreverPid + '.fvr'), function () {
              // Ignore errors
            });
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
// function randomString (bits)
//   randomString returns a pseude-random ASCII string which contains at least 
//   the specified number of bits of entropy the return value is a string of 
//   length ⌈bits/6⌉ of characters from the base64 alphabet.
//
forever.randomString = function (bits) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', 
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
    .concat([padding + '[', proc.pid + ',', proc.foreverPid, ']'])
    .join(' ');
};

//
// function getAllProcess ()
//   Returns all data for processes managed by forever
//
function getAllProcesses () {
  var processes = [];
  try {
    var files = fs.readdirSync(config.pidPath);
    if (files.length === 0) {
      return null;
    }
    
    files = files.filter(function(file) { return /\.fvr$/.test(file) });
    files.forEach(function (file) {
      var child = JSON.parse(fs.readFileSync(path.join(config.pidPath, file)));
      processes.push(child);
    });

    return processes;
  } 
  catch (ex) {
    // Ignore errors
    return null;
  }
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
  
  options.options.unshift(file);
  options.silent = options.silent || false;
  options.forever = options.forever || false;
  
  // If we should log stdout, open a file buffer 
  if (options.outFile) {
    this.stdout = fs.createWriteStream(options.outFile, { flags: 'a+', encoding: 'utf8', mode: 0666 });
  }
  
  // If we should log stderr, open a file buffer
  if (options.errFile) {
    this.stderr = fs.createWriteStream(options.errFile, { flags: 'a+', encoding: 'utf8', mode: 0666 });
  }
  
  this.times = 0;
  this.options = options;
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
  
  var child = spawn('node', this.options.options);
  this.child = child;
  this.running = true;
  
  // Hook all stream data and process it
  function listenTo (stream) {
    child[stream].on('data', function (data) {
      // If we haven't been silenced, and we don't have a file stream
      // to output to write to the process stdout stream
      if (!self.options.silent && !self.options[stream]) {
        process.stdout.write(data);
      }
      
      // If we have been given an output file for the stream, write to it
      if (self.options[stream]) {
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

    if (self.options.forever || self.times < self.options.max) {
      self.emit('restart', null, self);
      process.nextTick(function () {
        self.log('Forever restarting script for ' + self.times + ' time');
        self.start(true).save();
      });
    }
    else {
      this.running = false;
      
      // If had to write to an stdout file, close it
      if (self.options.stdout) {
        self.stdout.end();
      }
      
      // If had to write to an stderr file, close it
      if (self.options.stderr) {
        self.stderr.end();
      }
      
      self.emit('exit', null, self);
    }
  });
  
  return this;
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
    logFile: this.options.logFile,
    options: this.options.options.slice(1),
    file: this.options.options[0]
  };
  
  this.childData = childData;
  if (this.options.pidFile) {
    childData.pidFile = this.options.pidFile;
  }
  
  var childPath = path.join(config.pidPath, childData.foreverPid + '.fvr');
  fs.writeFile(childPath, JSON.stringify(childData), function (err) {
    if (err) self.emit('error', err);
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
  //process.on('SIGTERM', function () {
  //  process.exit(0);
  //});
  
  //process.on('exit', function () {
  //  fs.unlinkSync(childPath);
  //});
  
  return this;
};

//
// function log (message)
//   Utility function for logging forever actions
//
Forever.prototype.log = function (message) {
  if (!this.options.silent) {
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