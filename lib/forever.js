/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var fs = require('fs'),
    path = require('path'),
    events = require('events'),
    exec = require('child_process').exec,
    net = require('net'),
    cliff = require('cliff'),
    daemon = require('daemon'),
    nconf = require('nconf'),
    portfinder = require('portfinder'),
    timespan = require('timespan'),
    spawn = require('child_process').spawn,
    psTree = require('ps-tree'),
    utile = require('utile'),
    mkdirp = utile.mkdirp,
    async = utile.async,
    winston = require('winston');

var forever = exports;

//
// Setup `forever.log` to be a custom `winston` logger.
//
forever.log = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)()
  ]
});

forever.log.cli();

//
// ### Export Components / Settings
// Export `version` and important Prototypes from `lib/forever/*`
//
forever.initialized = false;
forever.root        = path.join(process.env.HOME || '/root', '.forever');
forever.config      = new nconf.File({ file: path.join(forever.root, 'config.json') });
forever.Forever     = forever.Monitor = require('./forever/monitor').Monitor;
forever.cli         = require('./forever/cli');

//
// Expose version through `pkginfo`
//
require('pkginfo')(module, 'version');

//
// Expose the global forever service
//
forever.__defineGetter__('service', function () {
  return require('./forever/service');
});

//
// ### function getSockets (sockPath, callback)
// #### @sockPath {string} Path in which to look for UNIX domain sockets
// #### @callback {function} Continuation to pass control to when complete
// Attempts to read the files from `sockPath` if the directory does not exist,
// then it is created using `mkdirp`.
//
function getSockets(sockPath, callback) {
  var sockets;
  
  try {
    sockets = fs.readdirSync(sockPath);
  }
  catch (ex) {
    if (ex.code !== 'ENOENT') {
      return callback(ex);
    }

    return mkdirp(sockPath, '0755', function (err) {
      return err ? callback(err) : callback(null, []);
    });
  }

  callback(null, sockets);
}

//
// ### function getAllProcess (callback)
// #### @callback {function} Continuation to respond to when complete.
// Returns all data for processes managed by forever.
//
function getAllProcesses(callback) {
  var sockPath = forever.config.get('sockPath'),
      results = [];

  function getProcess(name, next) {
    var fullPath = path.join(sockPath, name),
        socket = new net.Socket({ type: 'unix' }),
        parsed = false,
        data = '';

    function tryParse() {
      if (!parsed) {
        parsed = true;
      
        var monitors;
        try {
          monitors = JSON.parse(data);
        }
        catch (ex) {
          //
          // Ignore errors
          //
        }
      
        //
        // Be a little lazier about loading results
        //
        if (monitors && monitors.monitors) {
          results = results.concat(monitors.monitors);
        }
      
        next();
      }
    }

    socket.on('error', function (err) {
      if (err.code === 'ECONNREFUSED') {
        try {
          fs.unlinkSync(fullPath);
        }
        catch (ex) { }
        return tryParse();
      }
      else if (err.code === 'EACCES') {
        forever.log.warn('Error contacting: ' + fullPath.magenta);
      }
      else {
        forever.log.error('Unknown error (' + err.code + ') when contacting: ' + fullPath.magenta);
      }

      tryParse();
    });

    socket.on('data', function (msg) {
      data += msg;
    });

    socket.on('close', tryParse);

    socket.connect(fullPath);
  }

  getSockets(sockPath, function (err, sockets) {
    if (err || (sockets && sockets.length === 0)) {
      return callback(err);
    }

    async.forEach(sockets, getProcess, function () {
      callback(results);
    });
  });
}

//
// ### function getAllPids ()
// Returns the set of all pids managed by forever.
// e.x. [{ pid: 12345, foreverPid: 12346 }, ...]
//
function getAllPids(processes) {
  return !processes ? null : processes.map(function (proc) {
    return {
      pid: proc.pid,
      foreverPid: proc.foreverPid
    };
  });
}

//
// ### function load (options, [callback])
// #### @options {Object} Options to load into the forever module
// Initializes configuration for forever module
//
forever.load = function (options) {
  //
  // Setup the incoming options with default options.
  //
  options           = options           || {};
  options.loglength = options.loglength || 100;
  options.root      = options.root      || forever.root;
  options.pidPath   = options.pidPath   || path.join(options.root, 'pids');
  options.sockPath  = options.sockPath  || path.join(options.root, 'sock');

  //
  // If forever is initalized and the config directories are identical
  // simply return without creating directories
  //
  if (forever.initialized && forever.config.get('root') === options.root &&
    forever.config.get('pidPath') === options.pidPath) {
    return;
  }

  forever.config = new nconf.File({ file: path.join(options.root, 'config.json') });

  //
  // Try to load the forever `config.json` from
  // the specified location.
  //
  try {
    forever.config.loadSync();
  }
  catch (ex) { }

  //
  // Setup the columns for `forever list`.
  //
  options.columns  = options.columns  || forever.config.get('columns');
  if (!options.columns) {
    options.columns = [
      'uid', 'command', 'script', 'forever', 'pid', 'logfile', 'uptime'
    ];
  }

  forever.config.set('root', options.root);
  forever.config.set('pidPath', options.pidPath);
  forever.config.set('sockPath', options.sockPath);
  forever.config.set('loglength', options.loglength);
  forever.config.set('columns', options.columns);

  //
  // Attempt to see if `forever` has been configured to
  // run in debug mode.
  //
  options.debug = options.debug || forever.config.get('debug') || false;

  if (options.debug) {
    //
    // If we have been indicated to debug this forever process
    // then setup `forever._debug` to be an instance of `winston.Logger`.
    //
    forever._debug();
  }

  //
  // Syncronously create the `root` directory
  // and the `pid` directory for forever. Although there is
  // an additional overhead here of the sync action. It simplifies
  // the setup of forever dramatically.
  //
  function tryCreate(dir) {
    try {
      fs.mkdirSync(dir, '0755');
    }
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
// ### @private function _debug ()
// Sets up debugging for this forever process
//
forever._debug = function () {
  var debug = forever.config.get('debug');

  if (!debug) {
    forever.config.set('debug', true);
    forever.log.add(winston.transports.File, {
      level: 'silly',
      filename: path.join(forever.config.get('root'), 'forever.debug.log')
    });
  }
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
  var logAppend;

  if (arguments.length === 4) {
    logAppend = callback;
    callback = arguments[3];
  }

  fs.stat(script, function (err, stats) {
    if (err) {
      return callback(new Error('script ' + script + ' does not exist.'));
    }

    return logAppend ? callback(null) : fs.stat(logFile, function (err, stats) {
      return !err
        ? callback(new Error('log file ' + logFile + ' exists.'))
        : callback(null);
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
  options         = options || {};
  options.uid     = options.uid || utile.randomString(4).replace(/^\-/, '_');
  options.logFile = forever.logFilePath(options.logFile || options.uid + '.log');
  options.pidFile = forever.pidFilePath(options.pidFile || options.uid + '.pid');

  var monitor = new forever.Monitor(script, options);

  fs.open(options.logFile, options.appendLog ? 'a+' : 'w+', function (err, fd) {
    if (err) {
      return monitor.emit('error', err);
    }

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
    monitor.start();
  });

  return monitor;
};

//
// ### function startServer ()
// #### @arguments {forever.Monitor...} A list of forever.Monitor instances
// Starts the `forever` HTTP server for communication with the forever CLI.
// **NOTE:** This will change your `process.title`.
//
forever.startServer = function () {
  var args = Array.prototype.slice.call(arguments),
      socket = path.join(forever.config.get('sockPath'), 'forever.sock'),
      monitors = [],
      callback,
      server;

  args.forEach(function (a) {
    if (Array.isArray(a)) {
      monitors = monitors.concat(a.filter(function (m) {
        return m instanceof forever.Monitor;
      }));
    }
    else if (a instanceof forever.Monitor) {
      monitors.push(a);
    }
    else if (typeof a === 'function') {
      callback = a;
    }
  });

  server = net.createServer(function (socket) {
    //
    // Write the specified data and close the socket
    //
    socket.end(JSON.stringify({
      monitors: monitors.map(function (m) {
        return m.data;
      })
    }));
  });
  
  function onError(err) {
    monitors.forEach(function (mon) {
      mon.emit('error', err);
    });
  }

  portfinder.getSocket({ path: socket }, function (err, socket) {
    if (err) {
      return onError(err);
    }

    server.on('error', onError);

    server.listen(socket, function () {
      if (callback) {
        callback(null, server, socket);
      }
    });
  });
};


//
// ### function stop (target, [format])
// #### @target {string} Index or script name to stop
// #### @format {boolean} Indicated if we should CLI format the returned output.
// Stops the process(es) with the specified index or script name
// in the list of all processes
//
forever.stop = function (target, format) {
  var emitter = new events.EventEmitter(),
      results = [],
      pids;

  getAllProcesses(function (processes) {
    var procs = forever.findByIndex(target, processes)
      || forever.findByScript(target, processes);

    if (procs && procs.length > 0) {
      pids = procs.reduce(function (agg, proc) {
        return agg.concat(proc.foreverPid, proc.pid);
      }, []);

      async.forEach(pids, function (pid, next) {
        forever.kill(pid, true, next);
      }, function () {
        emitter.emit('stop', forever.format(format, procs));
      });
    }
    else {
      process.nextTick(function () {
        emitter.emit('error', new Error('Cannot find forever process: ' + target));
      });
    }
  });

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
          '--sourceDir', proc.sourceDir,
          '-l', proc.logFile,
          '--append'
        ];

        if (proc.silent) {
          restartCommand.push('--silent');
        }

        if (proc.outFile) {
          restartCommand.push('-o', path.join(proc.sourceDir, proc.outFile));
        }

        if (proc.errFile) {
          restartCommand.push('-e', path.join(proc.sourceDir, proc.outFile));
        }

        restartCommand.push(proc.file, proc.options.join(' '));
        forever.log.silly('Restarting with options', { options: restartCommand.join(' ') });

        exec(restartCommand.join(' '), proc.spawnWith, function (err, stdout, stderr) {
          next();
        });
      }, function () {
        emitter.emit('restart', forever.format(format, procs));
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
  var proc = processes && processes[parseInt(index, 10)];
  return proc ? [proc] : null;
};

//
// ### function findByScript (script, processes)
// #### @script {string} The name of the script to find.
// #### @processes {Array} Set of processes to find in.
// Finds the process with the specified script name.
//
forever.findByScript = function (script, processes) {
  return !processes
    ? null
    : processes.filter(function (p) {
      return p.file === script;
    });
};

//
// ### function stopAll (format)
// #### @format {boolean} Value indicating if we should format output
// Stops all processes managed by forever.
//
forever.stopAll = function (format) {
  var emitter = new events.EventEmitter();

  getAllProcesses(function (processes) {
    var pids = getAllPids(processes);

    if (format) {
      processes = forever.format(format, processes);
    }

    if (pids && processes) {
      pids = pids.reduce(function (agg, proc) {
        return agg.concat(proc.foreverPid, proc.pid);
      }, []);
      
      async.forEach(pids, function (pid, next) {
        if (pid !== process.pid) {
          forever.kill(pid, true, next);
        }
      }, function () {
        emitter.emit('stopAll', processes);
      });
    }
    else {
      process.nextTick(function () {
        emitter.emit('stopAll', null);
      });
    }
  });

  return emitter;
};

//
// ### function list (format, procs, callback)
// #### @format {boolean} If set, will return a formatted string of data
// #### @callback {function} Continuation to respond to when complete.
// Returns the list of all process data managed by forever.
//
forever.list = function (format, callback) {
  getAllProcesses(function (processes) {
    callback(null, forever.format(format, processes));
  });
};

//
// ### function tail (target, length, callback) 
// #### @target {string} Target script to list logs for
// #### @length {number} **Optional** Length of the logs to tail.
// #### @callback {function} Continuation to respond to when complete.
// Responds with the latest `length` logs for the specified `target` process
// managed by forever. If no `length` is supplied then `forever.config.get('loglength`)`
// is used.
//
forever.tail = function (target, length, callback) {
  if (!callback && typeof length === 'function') {
    callback = length;
    length = 0;
  }
  
  length = length || forever.config.get('loglength');
  if (!length) {
    return callback(new Error('Cannot tail logs without a specified length'));
  }

  function tailProcess(proc, next) {
    exec('tail -n ' + [length, proc.logFile].join(' '), function (err, stdout) {
      if (err) {
        return next(err);
      }
      
      proc.logs = stdout.split('\n');
      proc.logs.pop();
      
      return err ? next(err) : next(null, proc);
    });
  }
  
  getAllProcesses(function (processes) {
    if (!processes) {
      return callback(new Error('Cannot find forever process: ' + target));
    }
   
    var procs = forever.findByIndex(target, processes)
      || forever.findByScript(target, processes);
    
    async.mapSeries(procs, tailProcess, function (err, procs) {
      return err
        ? callback(err)
        : callback(null, procs);
    });
  });
};

//
// ### function format (format, procs)
// #### @format {Boolean} Value indicating if processes should be formatted
// #### @procs {Array} Processes to format
// Returns a formatted version of the `procs` supplied based on the column
// configuration in `forever.config`.
//
forever.format = function (format, procs) {
  if (!procs || procs.length === 0) {
    return null;
  }
  
  var index = 0,
      columns = forever.config.get('columns'),
      rows = [['   '].concat(columns)],
      formatted;
  
  function mapColumns(prefix, mapFn) {
    return [prefix].concat(columns.map(mapFn));
  }

  if (format) {
    //
    // Iterate over the procs to see which has the
    // longest options string
    //
    procs.forEach(function (proc) {
      rows.push(mapColumns('[' + index + ']', function (column) {
        return forever.columns[column]
          ? forever.columns[column].get(proc)
          : 'MISSING';
      }));

      index++;
    });

    formatted = cliff.stringifyRows(rows, mapColumns('white', function (column) {
      return forever.columns[column]
        ? forever.columns[column].color
        : 'white';
    }));
  }

  return format ? formatted : procs;
};

//
// ### function cleanUp ()
// Utility function for removing excess pid and
// config, and log files used by forever.
//
forever.cleanUp = function (cleanLogs, allowManager) {
  var emitter = new events.EventEmitter(),
      pidPath = forever.config.get('pidPath');

  getAllProcesses(function (processes) {
    if (cleanLogs) {
      forever.cleanLogsSync(processes);
    }
    
    function unlinkProcess(proc, done) {
      fs.unlink(path.join(pidPath, proc.uid + '.pid'), function () {
        //
        // Ignore errors (in case the file doesnt exist).
        //

        if (cleanLogs && proc.logFile) {
          //
          // If we are cleaning logs then do so if the process
          // has a logfile.
          //
          return fs.unlink(proc.logFile, function () {
            done();
          });
        }

        done();
      });
    }

    function cleanProcess(proc, done) {
      if (proc.child && proc.manager) {
        return done();
      }
      else if (!proc.child && !proc.manager
        || (!proc.child && proc.manager && allowManager)
        || proc.dead) {
        return unlinkProcess(proc, done);
      }

      //
      // If we have a manager but no child, wait a moment
      // in-case the child is currently restarting, but **only**
      // if we have not already waited for this process
      //
      if (!proc.waited) {
        proc.waited = true;
        return setTimeout(function () {
          checkProcess(proc, done);
        }, 500);
      }

      done();
    }
    
    function checkProcess(proc, next) {
      proc.child = forever.checkProcess(proc.pid);
      proc.manager = forever.checkProcess(proc.foreverPid);
      cleanProcess(proc, next);
    }

    if (processes && processes.length > 0) {
      (function cleanBatch(batch) {
        async.forEach(batch, checkProcess, function () {
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
  });

  return emitter;
};

//
// ### function cleanLogsSync (processes)
// #### @processes {Array} The set of all forever processes
// Removes all log files from the root forever directory
// that do not belong to current running forever processes.
//
forever.cleanLogsSync = function (processes) {
  var root = forever.config.get('root'),
      files = fs.readdirSync(root),
      running,
      runningLogs;
  
  running = processes && processes.filter(function (p) {
    return p && p.logFile;
  });
      
  runningLogs = running && running.map(function (p) {
    return p.logFile.split('/').pop();
  });

  files.forEach(function (file) {
    if (/\.log$/.test(file) && (!runningLogs || runningLogs.indexOf(file) === -1)) {
      fs.unlinkSync(path.join(root, file));
    }
  });
};

//
// ### function logFilePath (logFile)
// #### @logFile {string} Log file path
// Determines the full logfile path name
//
forever.logFilePath = function (logFile, uid) {
  return logFile && logFile[0] === '/'
    ? logFile
    : path.join(forever.config.get('root'), logFile || (uid || 'forever') + '.log');
};

//
// ### function pidFilePath (pidFile)
// #### @logFile {string} Pid file path
// Determines the full pid file path name
//
forever.pidFilePath = function (pidFile) {
  return pidFile && pidFile[0] === '/'
    ? pidFile
    : path.join(forever.config.get('pidPath'), pidFile);
};

//
// ### function checkProcess (pid, callback)
// #### @pid {string} pid of the process to check
// #### @callback {function} Continuation to pass control backto.
// Utility function to check to see if a pid is running
//
forever.checkProcess = function (pid) {
  if (!pid) {
    return false;
  }

  try {
    //
    // Trying to kill non-existent process here raises a ESRCH - no such
    // process exception. Also, signal 0 doesn't do no harm to a process - it
    // only checks if sending a singal to a given process is possible.
    //
    process.kill(pid, 0);
    return true;
  }
  catch (err) {
    return false;
  }
};

forever.kill = function(pid, killTree, callback) {
  if (killTree) {
    psTree(pid, function (err, children) {
      var pids = children.map(function (p) {
        return p.PID;
      });

      pids.unshift(pid);
      spawn('kill', ['-9'].concat(pids)).on('exit', callback || function() {});
    });
  }
  else {
    try {
      process.kill(pid);
    }
    catch (ex) { }
    callback && callback();
  }
  
}

//
// ### @columns {Object}
// Property descriptors for accessing forever column information
// through `forever list` and `forever.list()`
//
forever.columns = {
  uid: {
    color: 'white',
    get: function (proc) {
      return proc.uid;
    }
  },
  command: {
    color: 'grey',
    get: function (proc) {
      return (proc.command || 'node').grey;
    }
  },
  script: {
    color: 'grey',
    get: function (proc) {
      return [proc.file].concat(proc.options).join(' ').grey;
    }
  },
  forever: {
    color: 'white',
    get: function (proc) {
      return proc.foreverPid;
    }
  },
  pid: {
    color: 'white',
    get: function (proc) {
      return proc.pid;
    }
  },
  logfile: {
    color: 'magenta',
    get: function (proc) {
      return proc.logFile ? proc.logFile.magenta : '';
    }
  },
  uptime: {
    color: 'yellow',
    get: function (proc) {
      return timespan.fromDates(new Date(proc.ctime), new Date()).toString().yellow;
    }
  }
};
