/*
 * cli.js: Handlers for the forever CLI commands.
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

var path = require('path'),
    cliff = require('cliff'),
    forever = require('../forever');

var cli = exports;

var reserved = ['root', 'pidPath'];

//
// ### function exec (action, file, options)
// #### @action {string} CLI action to execute
// #### @file {string} Location of the target forever script or process.
// #### @options {Object} Options to pass to forever for the `action`.
// Executes the `action` in forever with the specified `file` and `options`.
//
cli.exec = function (action, file, options) {
  var display = Array.isArray(action) ? action.join(' ') : action;
  
  if (action) {
    forever.log.info('Running action: ' + display.yellow);
  }

  if (action === 'cleanlogs') {
    forever.log.silly('Tidying ' + forever.config.get('root'));
    var tidy = forever.cleanUp(action === 'cleanlogs');
    tidy.on('cleanUp', function () {
      forever.log.silly(forever.config.get('root') + ' tidied.');
    });
    return;
  }

  if (file && action === 'start') {
    forever.log.info('Forever processing file: ' + file.grey);
  }

  if (options.command) {
    forever.log.info('Forever using command: ' + options.command.grey);
  }

  if (options && action !== 'set') {
    forever.log.silly('Forever using options', options);
  }

  //
  // If there is no action then start in the current
  // process with the specified `file` and `options`.
  //
  if (!action) {
    return cli.start(file, options);
  }

  return Array.isArray(action) 
    ? cli[action[0]](action[1], options)
    : cli[action](file, options, true);
};

//
// ### function start (file, options, daemon)
// #### @file {string} Location of the script to spawn with forever
// #### @options {Object} Options to spawn the script `file` with.
// #### @daemon {boolean} Value indicating if we should spawn as a daemon
// Starts a forever process for the script located at `file` with the
// specified `options`. If `daemon` is true, then the script will be
// started as a daemon process.
//
cli.start = function (file, options, daemon) {
  tryStart(file, options, function () {
    var monitor = daemon
      ? forever.startDaemon(file, options)
      : forever.start(file, options);

    monitor.on('start', function () {
      forever.startServer(monitor);
    });
  });
};

//
// ### function stop (file)
// #### @file {string} Target forever process to stop
// Stops the forever process specified by `file`.
//
cli.stop = function (file) {
  var runner = forever.stop(file, true);

  runner.on('stop', function (process) {
    forever.log.info('Forever stopped process:');
    forever.log.data(process);
  });

  runner.on('error', function (err) {
    forever.log.error('Forever cannot find process with index: ' + file)
  });
};

//
// ### function stopall ()
// Stops all currently running forever processes.
//
cli.stopall = function () {
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
};

//
// ### function restart (file)
// #### @file {string} Target process to restart
// Restarts the forever process specified by `file`.
//
cli.restart = function (file) {
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
};

//
// ### function list ()
// Lists all currently running forever processes.
//
cli.list = function () {
  forever.list(true, function (err, processes) {
    if (processes) {
      forever.log.info('Forever processes running');
      processes.split('\n').forEach(function (line) {
        forever.log.data(line);
      })
    }
    else {
      forever.log.info('No forever processes running');
    }
  });
};

//
// ### function config ()
// Lists all of the configuration in `~/.forever/config.json`.
//
cli.config = function () {
  var keys = Object.keys(forever.config.store),
      conf = cliff.inspect(forever.config.store);

  if (keys.length <= 2) {
    conf = conf.replace(/\{\s/, '{ \n')
               .replace(/\}/, '\n}')
               .replace('\033[90m', '  \033[90m')
               .replace(/, /ig, ',\n  ')
  }
  else {
    conf = conf.replace(/\n\s{4}/ig, '\n  ');
  }

  conf.split('\n').forEach(function (line) {
    forever.log.data(line);
  });
};

//
// ### function set (key, value)
// #### @key {string} Key to set in forever config
// #### @value {string} Value to set for `key`
// Sets the specified `key` / `value` pair in the
// forever user config.
//
cli.set = function (key, value) {
  if (!key || !value) {
    return forever.log.error('Both <key> and <value> are required.');
  }

  updateConfig(function () {
    forever.log.info('Setting forever config: ' + key.grey);
    forever.config.set(key, value);
  });
};

//
// ### function clear (key)
// #### @key {string} Key to remove from `~/.forever/config.json`
// Removes the specified `key` from the forever user config.
//
cli.clear = function (key) {
  if (reserved.indexOf(key) !== -1) {
    forever.log.warn('Cannot clear reserved config: ' + key.grey);
    forever.log.warn('Use `forever set ' + key + '` instead');
    return;
  }

  updateConfig(function () {
    forever.log.info('Clearing forever config: ' + key.grey);
    forever.config.clear(key);
  });
};

//
// ### function columns (action, value)
// #### @action {string} The subaction to execute
// #### @value {Array} The value to use in the specified `action`.
// Executes the specified subaction: `add`, `rm`, and `set` which 
// add, remove, or completely overrides the columns used by `forever list`
// and `forever.list()`.
//
cli.columns = function (action, value) {
  if (!~['add', 'rm', 'set'].indexOf(action)) {
    forever.log.error('Invalid action: ' + ('columns ' + action).yellow);
    forever.log.info('Use: ' + 'columns <add|rm|set>'.yellow);
    return;
  }
  
  var columns = forever.config.get('columns'),
      actions = { add: addColumn, rm: rmColumn, set: setColumns },
      allColumns = Object.keys(forever.columns);
  
  function addColumn () {
    if (~columns.indexOf(value)) {
      return forever.log.warn(value.magenta + ' already exists in forever');
    }
    
    forever.log.info('Adding column: ' + value.magenta);
    columns.push(value);
  }
  
  function rmColumn () {
    if (!~columns.indexOf(value)) {
      return forever.log.warn(value.magenta + ' doesn\'t exist in forever');
    }
    
    forever.log.info('Removing column: ' + value.magenta);
    columns.splice(columns.indexOf(value), 1);
  }
  
  function setColumns () {
    forever.log.info('Setting columns: ' + value.join(' ').magenta);
    columns = value;
  }

  if (action !== 'set') {
    value = value[0];
  }

  if (!~allColumns.indexOf(value)) {
    return forever.log.error('Unknown column: ' + value.magenta);
  }

  actions[action]();
  forever.config.set('columns', columns);
  forever.config.saveSync();
}

//
// ### @private function (file, options, callback)
// #### @file {string} Target script to start
// #### @options {Object} Options to start the script with
// #### @callback {function} Continuation to respond to when complete.
// Helper function that sets up the pathing for the specified `file`
// then stats the appropriate files and responds.
//
function tryStart (file, options, callback) {
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
function updateConfig (updater) {
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
