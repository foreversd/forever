/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

require.paths.unshift(__dirname);

var fs = require('fs'),
    colors = require('colors'),
    async = require('async'),
    path = require('path'),
    events = require('events'),
    exec = require('child_process').exec,
    timespan = require('timespan'),
    nconf = require('nconf'),
    daemon = require('daemon');

var forever = exports;

//
// ### Export Components / Settings
// Export `version` and important Prototypes from `lib/forever/*`
//
forever.version     = [0, 4, 0];
forever.initialized = false;
forever.root        = path.join(process.env.HOME, '.forever');
forever.config      = new nconf.stores.File({ file: path.join(forever.root, 'config.json') });
forever.cli         = require('forever/cli');
forever.Forever     = forever.Monitor = require('forever/monitor').Monitor; 

//
// ### function load (options, [callback])
// #### @options {Object} Options to load into the forever module
// Initializes configuration for forever module
//
forever.load = function (options) {
  //
  // Setup the incoming options with default options.
  //
  options         = options || {};
  options.root    = options.root || forever.root,
  options.pidPath = options.pidPath || path.join(options.root, 'pids');
  
  //
  // If forever is initalized and the config directories are identical
  // simply return without creating directories
  //
  if (forever.initialized && forever.config.get('root') === options.root && 
    forever.config.get('pidPath') === options.pidPath) {
    return;
  }
  
  forever.config = new nconf.stores.File({ file: path.join(options.root, 'config.json') });
  
  //
  // Try to load the forever `config.json` from 
  // the specified location.
  //
  try {
    forever.config.loadSync();
  }
  catch (ex) { }
  
  forever.config.set('root', options.root);
  forever.config.set('pidPath', options.pidPath);
  
  //
  // Syncronously create the `root` directory
  // and the `pid` directory for forever. Although there is
  // an additional overhead here of the sync action. It simplifies
  // the setup of forever dramatically.  
  //
  function tryCreate (dir) {
    try { fs.mkdirSync(dir, 0755); }
    catch (ex) { }
  }

  tryCreate(forever.config.get('root'));
  tryCreate(forever.config.get('pidPath'));
  
  //
  // Attempt to save the new `config.json` for forever
  //
  try {
    forever.config.saveSync();
  }
  catch (ex) { }
  
  forever.initialized = true;
};

//
// Ensure forever will always be loaded the first time it is required.
//
forever.load();

//
// ### function stat (logFile, script, callback)
// #### @logFile {string} Path to the log file for this script
// #### @logAppend {boolean} Optional. True Prevent failure if the log file exists.
// #### @script {string} Path to the target script.
// #### @callback {function} Continuation to pass control back to 
// Ensures that the logFile doesn't exist and that
// the target script does exist before executing callback.
//
forever.stat = function (logFile, script, callback) {
  var logAppend,
      realCallback = callback;
      
  if (arguments.length === 4) {
    logAppend = callback;
    realCallback = arguments[3];
  }

  fs.stat(script, function (err, stats) {
    if (err) return realCallback(new Error('script ' + script + ' does not exist.'));

    if (logAppend) {
      realCallback(null);
      return;
    }

    fs.stat(logFile, function (err, stats) {
      if (!err) return realCallback(new Error('log file ' + logFile + ' exists.'));
      realCallback(null);
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
  options.logFile = forever.logFilePath(options.logFile);
  options.pidFile = forever.pidFilePath(options.pidFile);
  var runner = new forever.Monitor(script, options);
  
  fs.open(options.logFile, options.appendLog ? 'a+' : 'w+', function (err, fd) {
    if (err) return runner.emit('error', err);

    var pid = daemon.start(fd);
    daemon.lock(options.pidFile);

    //
    // Remark: This should work, but the fd gets screwed up 
    //         with the daemon process.
    //
    // process.on('exit', function () {
    //   fs.unlinkSync(options.pidFile);
    // });

    process.pid = pid;
    runner.start();
  });
  
  return runner;
};

//
// ### function stop (target, [format])
// #### @target {string} Index or script name to stop
// #### @format {boolean} Indicated if we should CLI format the returned output.
// Stops the process(es) with the specified index or script name 
// in the list of all processes
//
forever.stop = function (target, format, restart) {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses(),
      results = [];
  
  var procs = /(\d+)/.test(target) ? forever.findByIndex(target, processes)
                                   : forever.findByScript(target, processes);
  
  if (procs && procs.length > 0) {
    procs.forEach(function (proc) {
      try {
        process.kill(proc.foreverPid);
        process.kill(proc.pid);      
      }
      catch (ex) { }
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
// ### function restart (target, format)
// #### @target {string} Index or script name to restart
// #### @format {boolean} Indicated if we should CLI format the returned output.
// Restarts the process(es) with the specified index or script name 
// in the list of all processes
//
forever.restart = function (target, format) {
  var emitter = new events.EventEmitter(), 
      runner = forever.stop(target, false);
      
  runner.on('stop', function (procs) {
    if (procs && procs.length > 0) {
      async.forEach(procs, function (proc, next) {
        //
        // We need to spawn a new process running the forever CLI
        // here because we want each process to daemonize separately
        // without the main process running `forever restart myscript.js`
        // daemonizing itself.  
        //
        var restartCommand = [
          'forever', 
          'start',
          '-d', proc.sourceDir,
          '-l', proc.logFile,
          '--append'
        ];
        
        if (proc.outFile) {
          restartCommand.push('-o', path.join(proc.sourceDir, proc.outFile));
        }
        
        if (proc.errFile) {
          restartCommand.push('-e', path.join(proc.sourceDir, proc.outFile));
        }
        
        restartCommand.push(proc.file, proc.options.join(' '));
        exec(restartCommand.join(' '), function (err, stdout, stderr) {
          next();
        });
      }, function () {
        emitter.emit('restart', format ? forever.list(true, procs) : procs);
      });
    }
    else {
      emitter.emit('error', new Error('Cannot find forever process: ' + target));
    }
  });
  
  // Bubble up the error to the appropriate EventEmitter instance.
  runner.on('error', function (err) {
    emitter.emit('error', err);
  });
  
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
  return processes 
    ? processes.filter(function (p) { return p.file === script })
    : null; 
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
      try {
        process.kill(pid);
      }
      catch (ex) { }
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
// ### function list (format, procs) 
// #### @format {boolean} If set, will return a formatted string of data
// #### @procs {Array} Set of processes to list format.
// Returns the list of all process data managed by forever.
//
forever.list = function (format, procs) {
  var formatted = [];
  
  procs = procs || getAllProcesses();
  if (!procs) return null;
  
  if (format) {
    var index = 0, maxLen = 0;
    // Iterate over the procs to see which has the longest options string
    procs.forEach(function (proc) {
      proc.length = [proc.command || 'node', proc.file].concat(proc.options).join(' ').length;
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
// config, and log files used by forever.
//
forever.cleanUp = function (cleanLogs, allowManager) {
  var emitter = new events.EventEmitter(),
      processes = getAllProcesses(true),
      pidPath = forever.config.get('pidPath');
  
  if (cleanLogs) forever.cleanLogsSync(processes);
 
  if (processes && processes.length > 0) {
    function cleanProcess (proc, next) {
      checkProcess(proc.pid, function (child) {
        checkProcess(proc.foreverPid, function (manager) {
          if (!child && !manager || (!child && manager && allowManager) || proc.dead) {
            fs.unlink(path.join(pidPath, proc.uid + '.fvr'), function () {
              fs.unlink(path.join(pidPath, proc.uid + '.pid'), function () {
                //
                // Ignore errors
                //
                if (cleanLogs && proc.logFile) {
                  return fs.unlink(proc.logFile, function () { 
                    next();
                  });
                }
                
                next();
              });
            });
            
            return;
          }
          
          next();
        });
      });
    }
    
    (function cleanBatch (batch) {
      async.forEach(batch, cleanProcess, function () {
        return processes.length > 0 
          ? cleanBatch(processes.splice(0, 10))
          : emitter.emit('cleanUp');
      });
    })(processes.splice(0, 10));
    
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
  var files = fs.readdirSync(forever.config.get('root')),
      running = processes && processes.filter(function (p) { return p && p.logFile }),
      runningLogs = running && running.map(function (p) { return p.logFile.split('/').pop() });
  
  files.forEach(function (file) {
    if (/\.log$/.test(file) && (!runningLogs || runningLogs.indexOf(file) === -1)) {
      fs.unlinkSync(path.join(forever.config.get('root'), file));
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
// ### function logFilePath (logFile)
// #### @logFile {string} Log file path
// Determines the full logfile path name
//
forever.logFilePath = function(logFile, uid) {
  if (logFile && logFile[0] === '/') {
    return logFile;
  } else {
    return path.join(forever.config.get('root'), logFile || (uid || 'forever') + '.log');
  }
};

//
// ### function pidFilePath (pidFile)
// #### @logFile {string} Pid file path
// Determines the full pid file path name
//
forever.pidFilePath = function(pidFile) {
  if (pidFile && pidFile[0] === '/') {
    return pidFile;
  } else {
    return path.join(forever.config.get('pidPath'), pidFile);
  }
};

//
// ### function checkProcess (pid, callback) 
// #### @pid {string} pid of the process to check
// #### @callback {function} Continuation to pass control backto.
// Utility function to check to see if a pid is running
//
function checkProcess (pid, callback) {
  if (!pid) {
    return callback(false);
  }
  
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
  var command = proc.command || 'node';
  
  // Create an array of the output we can later join
  return ['  [' + index + ']', command.grey, proc.file.grey]
    .concat(proc.options.map(function (opt) { return opt.grey }))
    .concat([padding + '[' + proc.pid + ',', proc.foreverPid + ']'])
    .concat(proc.logFile ? proc.logFile.magenta : '')
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
      files = fs.readdirSync(forever.config.get('pidPath'));
  
  if (files.length === 0) return null;
  
  files.forEach(function (file) {
    try {
      var fullPath = path.join(forever.config.get('pidPath'), file),
          ext = path.extname(file),
          uid = file.replace(ext, ''),
          data = fs.readFileSync(fullPath).toString();

      switch (ext) {
        case '.pid':
          var pid = parseInt(data);
          if (!processes[uid]) processes[uid] = { 
            foreverPid: pid,
            uid: uid
          };
          break;

        case '.fvr':
          var child = JSON.parse(data);
          processes[uid] = child;
          break;
      }
    }
    catch (ex) {
      // Ignore errors 
      processes[uid] = {
        uid: uid
      };
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