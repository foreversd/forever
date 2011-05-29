/*
 * cli.js: Handlers for the forever CLI commands.
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    path = require('path'),
    eyes = require('eyes'),
    winston = require('winston'),
    forever = require('forever');

var cli = exports;

var reserved = ['root', 'pidPath'];

var inspect = eyes.inspector({ stream: null,
  styles: {               // Styles applied to stdout
    all:     null,        // Overall style applied to everything
    label:   'underline', // Inspection labels, like 'array' in `array: [1, 2, 3]`
    other:   'inverted',  // Objects which don't have a literal representation, such as functions
    key:     'grey',      // The keys in object literals, like 'a' in `{a: 1}`
    special: 'grey',      // null, undefined...
    number:  'blue',      // 1, 2, 3, etc
    bool:    'magenta',   // true false
    regexp:  'green',     // /\d+/
    string:  'yellow'
  }
});

//
// ### function exec (action, file, options)
// #### @action {string} CLI action to execute
// #### @file {string} Location of the target forever script or process.
// #### @options {Object} Options to pass to forever for the `action`.
// Executes the `action` in forever with the specified `file` and `options`.
//
cli.exec = function (action, file, options) {
  if (action) {
    winston.info('Running action: ' + action.yellow);
  }
  
  winston.silly('Tidying ' + forever.config.get('root'));
  var tidy = forever.cleanUp(action === 'cleanlogs'); 
  tidy.on('cleanUp', function () {
    winston.silly(forever.config.get('root') + ' tidied.');

    if (file && action !== 'set' && action !== 'clear') {
      winston.info('Forever processing file: ' + file.grey);
    }

    if (options && action !== 'set') {
      winston.silly('Forever using options', options);
    }

    //
    // If there is no action then start in the current
    // process with the specified `file` and `options`.
    //
    if (!action) {
      return cli.start(file, options);
    }
    else if (action === 'cleanlogs') {
      return;
    }

    var daemon = true;
    cli[action](file, options, daemon);
  });
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
    return daemon 
      ? forever.startDaemon(file, options)
      : forever.start(file, options);
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
    winston.info('Forever stopped process:');
    sys.puts(process);
  });
  
  runner.on('error', function (err) {
    winston.error('Forever cannot find process with index: ' + file)
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
      winston.info('Forever stopped processes:');
      sys.puts(processes);
    }
    else {
      winston.info('No forever processes running');
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
      winston.info('Forever restarted processes:');
      sys.puts(processes);
    }
    else {
      winston.info('No forever processes running');
    }
  });
};

//
// ### function list ()
// Lists all currently running forever processes.
//
cli.list = function () {
  var processes = forever.list(true);
  if (processes) {
    winston.info('Forever processes running');
    sys.puts(processes);
  }
  else {
    winston.info('No forever processes running');
  }
};

//
// ### function config ()
// Lists all of the configuration in `~/.forever/config.json`.
//
cli.config = function () {
  var keys = Object.keys(forever.config.store),
      conf = inspect(forever.config.store);
  
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
    winston.info(line);
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
    return winston.error('Both <key> and <value> are required.');
  }
  
  updateConfig(function () {
    winston.info('Setting forever config: ' + key.grey);
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
    winston.warn('Cannot clear reserved config: ' + key.grey);
    winston.warn('Use `forever set ' + key + '` instead');
    return;
  }
  
  updateConfig(function () {
    winston.info('Clearing forever config: ' + key.grey);
    forever.config.clear(key);
  });
};

//
// ### function (file, options, callback) 
// #### @file {string} Target script to start
// #### @options {Object} Options to start the script with
// #### @callback {function} Continuation to respond to when complete.
// Helper function that sets up the pathing for the specified `file`
// then stats the appropriate files and responds.
//
function tryStart (file, options, callback) {
  var fullLog, fullScript

  fullLog = forever.logFilePath(options.logFile, options.uid);
  fullScript = path.join(options.sourceDir, file);
  
  forever.stat(fullLog, fullScript, options.appendLog, function (err) {
    if (err) {
      winston.error('Cannot start forever: ' + err.message);
      process.exit(-1);
    }
  
    callback();
  });
}

//
// ### function updateConfig (updater)
// #### @updater {function} Function which updates the forever config
// Helper which runs the specified `updater` and then saves the forever 
// config to `forever.config.get('root')`.
//
function updateConfig (updater) {
  updater();
  forever.config.save(function (err) {
    if (err) {
      return winston.error('Error saving config: ' + err.message);
    }
    
    cli.config();
    winston.info('Forever config saved: ' + path.join(forever.config.get('root'), 'config.json').yellow);
  });
}