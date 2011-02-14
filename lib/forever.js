/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

require.paths.unshift(__dirname);

var fs = require('fs'),
    colors = require('colors'),
    path = require('path'),
    events = require('events'),
    exec = require('child_process').exec,
    timespan = require('timespan'),
    daemon = require('daemon');

var forever = exports, config;

//
// ### Export Components / Settings
// Export `version` and important Prototypes from `lib/forever/*`
//
forever.version = [0, 4, 0];
forever.path    = path.join('/tmp', 'forever');
forever.Forever = forever.Monitor = require('forever/monitor').Monitor; 

//
// ### function load (options, [callback])
// #### @options {Object} Options to load into the forever module
// #### [@callback] {function} Continuation to pass control back to
// Initializes configuration for forever module
//
forever.load = function (options, callback) {
  var emitter = new events.EventEmitter();
  options         = options || {};
  options.root    = options.root || forever.path,
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
// ### function stat (logFile, script, callback)
// #### @logFile {string} Path to the log file for this script
// #### @script {string} Path to the target script.
// #### @callback {function} Continuation to pass control back to 
// Ensures that the logFile doesn't exist and that
// the target script does exist before executing callback.
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
// ### function start (script, options) 
// #### @script {string} Location of the script to run.
// #### @options {Object} Configuration for forever instance.
// Starts a script with forever
//
forever.start = function (script, options) {
  return new forever.Monitor(script, options).start();
};

//
// ### function startDaemon (script, options)
// #### @script {string} Location of the script to run.
// #### @options {Object} Configuration for forever instance.
// Starts a script with forever as a daemon
//
forever.startDaemon = function (script, options) {
  options.logFile = path.join(config.root, options.logFile || 'forever.log');
  options.pidFile = path.join(config.pidPath, options.pidFile);
  var runner = new forever.Monitor(script, options);

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
// ### function stop (target, [format])
// #### @target {string} Index or script name to stop
// #### @format {boolean} Indicated if we should CLI format the returned output.
// Stops the process with the specified index or script name 
// in the list of all processes
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
// ### function findByIndex (index, processes)
// #### @index {string} Index of the process to find.
// #### @processes {Array} Set of processes to find in.
// Finds the process with the specified index.
//
forever.findByIndex = function (index, processes) {
  return processes && [processes[parseInt(index)]];
};

//
// ### function findByScript (script, processes)
// #### @script {string} The name of the script to find.
// #### @processes {Array} Set of processes to find in.
// Finds the process with the specified script name.
//
forever.findByScript = function (script, processes) {
  return processes.filter(function (p) { return p.file === script });
};

//
// ### function stopAll (format) 
// #### @format {boolean} Value indicating if we should format output
// Stops all processes managed by forever.
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
// ### function list (format) 
// #### @format {boolean} If set, will return a formatted string of data
// Returns the list of all process data managed by forever.
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
// ### function cleanUp () 
// Utility function for removing excess pid and 
// config files used by forever.
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
// ### function cleanLogsSync (processes)
// #### @processes {Array} The set of all forever processes
// Removes all log files from the root forever directory
// that do not belong to current running forever processes.
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
// ### function randomString (bits)
// #### @bits {Number} Bit-length of the base64 string to return.
// Returns a pseude-random ASCII string which contains at least 
// the specified number of bits of entropy the return value is a string of 
// length ⌈bits/6⌉ of characters from the base64 alphabet.
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
// ### function checkProcess (pid, callback) 
// #### @pid {string} pid of the process to check
// #### @callback {function} Continuation to pass control backto.
// Utility function to check to see if a pid is running
//
function checkProcess (pid, callback) {
  exec('ps ' + pid + ' | grep -v PID', function (err, stdout, stderr) {
    if (err) return callback(false);
    callback(stdout.indexOf(pid) !== -1);
  });
};

//
// ### function formatProcess (proc index, padding) 
// #### @proc {Object} Process to format
// #### @index {Number} Index of the process in the set of all processes
// #### @padding {string} Padding to add to the formatted output 
// Returns a formatted string for the process @proc at
// the specified index. 
//
function formatProcess (proc, index, padding) {
  // Create an array of the output we can later join
  return ['  [' + index + ']', proc.file.green]
    .concat(proc.options.map(function (opt) { return opt.green }))
    .concat([padding + '[' + proc.pid + ',', proc.foreverPid + ']'])
    .concat(proc.logFile.magenta)
    .concat(timespan.fromDates(new Date(proc.ctime), new Date()).toString().yellow)
    .join(' ');
};

//
// ### function getAllProcess ([findDead])
// #### @findDead {boolean} Optional parameter that indicates to return dead procs
// Returns all data for processes managed by forever.
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
// ### function getAllPids ()
// Returns the set of all pids managed by forever. 
// e.x. [{ pid: 12345, foreverPid: 12346 }, ...]
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