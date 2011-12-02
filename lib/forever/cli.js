/*
 * cli.js: Handlers for the forever CLI commands.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var fs = require('fs'),
    util = require('util'),
    path = require('path'),
    flatiron = require('flatiron'),
    cliff = require('cliff'),
    daemon = require('daemon'),
    forever = require('../forever');

var cli = exports;

var help = [
  'usage: forever [action] [options] SCRIPT [script-options]',
  '',
  'Monitors the script specified in the current process or as a daemon',
  '',
  'actions:',
  '  start               Start SCRIPT as a daemon',
  '  stop                Stop the daemon SCRIPT',
  '  stopall             Stop all running forever scripts',
  '  restart             Restart the daemon SCRIPT',
  '  list                List all running forever scripts',
  '  config              Lists all forever user configuration',
  '  set <key> <val>     Sets the specified forever config <key>',
  '  clear <key>         Clears the specified forever config <key>',
  '  logs                Lists log files for all forever processes',
  '  logs <script|index> Tails the logs for <script|index>',
  '  columns add <col>   Adds the specified column to the output in `forever list`',
  '  columns rm <col>    Removed the specified column from the output in `forever list`',
  '  columns set <cols>  Set all columns for the output in `forever list`',
  '  cleanlogs           [CAREFUL] Deletes all historical forever log files',
  '',
  'options:',
  '  -m  MAX          Only run the specified script MAX times',
  '  -l  LOGFILE      Logs the forever output to LOGFILE',
  '  -o  OUTFILE      Logs stdout from child script to OUTFILE',
  '  -e  ERRFILE      Logs stderr from child script to ERRFILE',
  '  -p  PATH         Base path for all forever related files (pid files, etc.)',
  '  -c  COMMAND      COMMAND to execute (defaults to node)',
  '  -a, --append     Append logs',
  '  --pidfile        The pid file',
  '  --sourceDir      The source directory for which SCRIPT is relative to',
  '  --minUptime      Minimum uptime (millis) for a script to not be considered "spinning"',
  '  --spinSleepTime  Time to wait (millis) between launches of a spinning script.',
  '  --plain          Disable command line colors',
  '  -d, --debug      Forces forever to log debug output',
  '  -v, --verbose    Turns on the verbose messages from Forever',
  '  -s, --silent     Run the child script silencing stdout and stderr',
  '  -w, --watch      Watch for file changes',
  '  -h, --help       You\'re staring at it',
  '',
  '[Long Running Process]',
  '  The forever process will continue to run outputting log messages to the console.',
  '  ex. forever -o out.log -e err.log my-script.js',
  '',
  '[Daemon]',
  '  The forever process will run as a daemon which will make the target process start',
  '  in the background. This is extremely useful for remote starting simple node.js scripts',
  '  without using nohup. It is recommended to run start with -o -l, & -e.',
  '  ex. forever start -l forever.log -o out.log -e err.log my-daemon.js',
  '      forever stop my-daemon.js',
  ''
];

var app = flatiron.app;

app.use(flatiron.plugins.cli, {
  usage: help
});

var argvOptions = {
  'command':   {alias: 'c'},
  'errFile':   {alias: 'e'},
  'logFile':   {alias: 'l'},
  'appendLog': {alias: ['a', 'append'], boolean: true},
  'max':       {alias: 'm'},
  'outFile':   {alias: 'o'},
  'path':      {alias: 'p'},
  'help':      {alias: 'h'},
  'silent':    {alias: 's', boolean: true},
  'verbose':   {alias: 'v', boolean: true},
  'watch':     {alias: 'w', boolean: true},
  'debug':     {alias: 'd', boolean: true},
  'plain':     {boolean: true}
};

app.config.argv(argvOptions).env();

var reserved = ['root', 'pidPath'];

//
// ### @private function (file, options, callback)
// #### @file {string} Target script to start
// #### @options {Object} Options to start the script with
// #### @callback {function} Continuation to respond to when complete.
// Helper function that sets up the pathing for the specified `file`
// then stats the appropriate files and responds.
//
function tryStart(file, options, callback) {
  var fullLog, fullScript;

  fullLog = forever.logFilePath(options.logFile, options.uid);
  fullScript = path.join(options.sourceDir, file);

  forever.stat(fullLog, fullScript, options.appendLog, function (err) {
    if (err) {
      forever.log.error('Cannot start forever');
      forever.log.error(err.message);
      process.exit(-1);
    }

    callback();
  });
}

//
// ### @private function updateConfig (updater)
// #### @updater {function} Function which updates the forever config
// Helper which runs the specified `updater` and then saves the forever
// config to `forever.config.get('root')`.
//
function updateConfig(updater) {
  updater();
  forever.config.save(function (err) {
    if (err) {
      return forever.log.error('Error saving config: ' + err.message);
    }

    cli.config();
    var configFile = path.join(forever.config.get('root'), 'config.json');
    forever.log.info('Forever config saved: ' + configFile.yellow);
  });
}

//
// ### @private function checkColumn (name)
// #### @name {string} Column to check
// Checks if column `name` exists
//
function checkColumn(name) {
  if (!forever.columns[name]) {
    forever.log.error('Unknown column: ' + name.magenta);
    return false;
  }
  return true;
}

//
// ### @private function getOptions (file)
// #### @file {string} File to run. **Optional**
// Returns `options` object for use with `forever.start` and
// `forever.startDaemon`
//
function getOptions(file) {
  var options = {};
  //
  // First isolate options which should be passed to file
  //
  options.options = process.argv.splice(process.argv.indexOf(file) + 1);

  //
  // Now we have to force optimist to reparse command line options because
  // we've removed some before.
  //
  app.config.stores.argv.store = {};
  app.config.use('argv');

  [
    'pidFile', 'logFile', 'errFile', 'watch', 'minUptime', 'appendLog',
    'silent', 'max', 'command', 'path', 'spinSleepTime', 'sourceDir',
    'uid'
  ].forEach(function (key) {
    options[key] = app.config.get(key);
  });

  options.sourceDir = file && file[0] !== '/' ? process.cwd() : '/';
  if (options.sourceDir) {
    options.spawnWith = {cwd: options.sourceDir};
  }

  return options;
}

//
// ### function cleanLogs
// Deletes all historical forever log files
//
app.cmd('cleanlogs', cli.cleanLogs = function () {
  forever.log.silly('Tidying ' + forever.config.get('root'));
  forever.cleanUp(true).on('cleanUp', function () {
    forever.log.silly(forever.config.get('root') + ' tidied.');
  });
});

//
// ### function start (file)
// #### @file {string} Location of the script to spawn with forever
// Starts a forever process for the script located at `file` as daemon
// process.
//
app.cmd(/start (.+)/, cli.startDaemon = function (file) {
  forever.log.info('Forever processing file: ' + file.grey);
  var options = getOptions(file);
  tryStart(file, options, function () {
    var monitor = forever.startDaemon(file, options);
    monitor.on('start', function () {
      forever.startServer(monitor);
    });
  });
});



//
// ### function stop (file)
// #### @file {string} Target forever process to stop
// Stops the forever process specified by `file`.
//
app.cmd(/stop (.+)/, cli.stop = function (file) {
  var runner = forever.stop(file, true);

  runner.on('stop', function (process) {
    forever.log.info('Forever stopped process:');
    forever.log.data(process);
  });

  runner.on('error', function (err) {
    forever.log.error('Forever cannot find process with index: ' + file);
  });
});

//
// ### function stopall ()
// Stops all currently running forever processes.
//
app.cmd('stopall', cli.stopall = function () {
  var runner = forever.stopAll(true);
  runner.on('stopAll', function (processes) {
    if (processes) {
      forever.log.info('Forever stopped processes:');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });
});

//
// ### function restart (file)
// #### @file {string} Target process to restart
// Restarts the forever process specified by `file`.
//
app.cmd(/restart (.+)/, cli.restart = function (file) {
  var runner = forever.restart(file, true);
  runner.on('restart', function (processes) {
    if (processes) {
      forever.log.info('Forever restarted process(es):');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });

  runner.on('error', function (err) {
    forever.log.error('Error restarting process: ' + file.grey);
    forever.log.error(err.message);
  });
});

//
// ### function list ()
// Lists all currently running forever processes.
//
app.cmd('list', cli.list = function () {
  forever.list(true, function (err, processes) {
    if (processes) {
      forever.log.info('Forever processes running');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      });
    }
    else {
      forever.log.info('No forever processes running');
    }
  });
});

//
// ### function config ()
// Lists all of the configuration in `~/.forever/config.json`.
//
app.cmd('config', cli.config = function () {
  var keys = Object.keys(forever.config.store),
      conf = cliff.inspect(forever.config.store);

  if (keys.length <= 2) {
    conf = conf.replace(/\{\s/, '{ \n')
               .replace(/\}/, '\n}')
               .replace('\\033[90m', '  \\033[90m')
               .replace(/, /ig, ',\n  ');
  }
  else {
    conf = conf.replace(/\n\s{4}/ig, '\n  ');
  }

  conf.split('\n').forEach(function (line) {
    forever.log.data(line);
  });
});

//
// ### function set (key, value)
// #### @key {string} Key to set in forever config
// #### @value {string} Value to set for `key`
// Sets the specified `key` / `value` pair in the
// forever user config.
//
app.cmd('set :key :value', cli.set = function (key, value) {
  updateConfig(function () {
    forever.log.info('Setting forever config: ' + key.grey);
    forever.config.set(key, value);
  });
});

//
// ### function clear (key)
// #### @key {string} Key to remove from `~/.forever/config.json`
// Removes the specified `key` from the forever user config.
//
app.cmd('clear :key', cli.clear = function (key) {
  if (reserved.indexOf(key) !== -1) {
    forever.log.warn('Cannot clear reserved config: ' + key.grey);
    forever.log.warn('Use `forever set ' + key + '` instead');
    return;
  }

  updateConfig(function () {
    forever.log.info('Clearing forever config: ' + key.grey);
    forever.config.clear(key);
  });
});

//
// ### function logs (target)
// #### @target {string} **Optional** Target script or index to list logs for
// Displays the logs using `tail` for the specified `target`. If no `target` is
// specified then it will display log files for all running forever processes.
//
app.cmd('logs :index', cli.logs = function (index) {
  //
  // Helper function for listing all log files
  //
  function listFiles() {
    var index = 0,
        rows = [['   ', 'script', 'logfile']];

    forever.list(false, function (err, processes) {
      forever.log.info('Logs for running Forever processes');
      rows = rows.concat(processes.map(function (proc) {
        return ['[' + index++ + ']', proc.file.grey, proc.logFile.magenta];
      }));

      cliff.putRows('data', rows, ['white', 'grey', 'magenta']);
    });
  }
  
  if (typeof index === 'undefined') {
    return listFiles();
  }
  
  forever.tail(index, function (err, logs) {
    if (err) {
      return forever.log.error(err.message);
    }
    
    logs.forEach(function (proc) {
      forever.log.info('Showing logs for ' + proc.file.magenta);
      proc.logs.forEach(function (line) {
        forever.log.data(line);
      });
    });
  });
});

app.cmd('columns add :name', cli.addColumn = function (name) {
  if (checkColumn(name)) {
    var columns = forever.config.get('columns');

    if (~columns.indexOf(name)) {
      return forever.log.warn(name.magenta + ' already exists in forever');
    }

    forever.log.info('Adding column: ' + name.magenta);
    columns.push(name);

    forever.config.set('columns', columns);
    forever.config.saveSync();
  }
});

app.cmd('columns rm :name', cli.rmColumn = function (name) {
  if (checkColumn(name)) {
    var columns = forever.config.get('columns');

    if (!~columns.indexOf(name)) {
      return forever.log.warn(name.magenta + ' doesn\'t exist in forever');
    }

    forever.log.info('Removing column: ' + name.magenta);
    columns.splice(columns.indexOf(name), 1);

    forever.config.set('columns', columns);
    forever.config.saveSync();
  }
});

app.cmd('columns set :value', cli.setColumns = function (columns) {
  forever.log.info('Setting columns: ' + columns.join(' ').magenta);

  forever.config.set('columns', columns);
  forever.config.saveSync();
});

//
// ### function help ()
// Shows help
//
app.cmd('help', cli.help = function () {
  util.puts(help.join('\n'));
});

//
// ### function start (file)
// #### @file {string} Location of the script to spawn with forever
// Starts a forever process for the script located at `file` as non-daemon
// process.
//
// Remark: this regex matches everything. It has to be added at the end to
// make executing other commands possible.
//
app.cmd(/(.*)/, cli.start = function (file) {
  var options = getOptions(file);
  tryStart(file, options, function () {
    var monitor = forever.start(file, options);
    monitor.on('start', function () {
      forever.startServer(monitor);
    });
  });
});

cli.start = function () {
  if (app.config.get('help')) {
    return util.puts(help.join('\n'));
  }

  app.init(app.start);
};

