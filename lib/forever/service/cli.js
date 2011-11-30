/*
 * cli.js: Handlers for the foreverd CLI commands.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */
 
var utile = require('utile'),
    optimist = require('optimist'),
    forever = require('../../forever'),
    Service = require('./service'),
    argv;

var mappings = {
  'c':             'command',
  'e':             'errFile',
  'l':             'logFile',
  'a':             'appendLog',
  'append':        'appendLog',
  'm':             'max',
  'o':             'outFile',
  'p':             'path',
  'pidfile':       'pidFile',
  's':             'silent',
  'silent':        'silent',
  'sourceDir':     'sourceDir',
  'minUptime':     'minUptime',
  'spinSleepTime': 'spinSleepTime',
  'v':             'verbose',
  'verbose':       'verbose',
  'd':             'debug',
  'debug':         'debug'
};

function processArgs(cmd) {

}

var router = module.exports = function router(app) {
  app.use(function (cmd, tty, next) {
    cmd.flags._.shift();
    cmd.service = new Service({
      adapter: cmd.flags.adapter
    });

    cmd.argv = cmd.flags._;
    var file = cmd.argv[0],
        options = {},
        config,
        uid;

    cmd.file = file;
    cmd.options = options;

    if (file) {
      //
      // Setup pass-thru options for child-process
      //
      options.options = cmd.argv.splice(cmd.argv.indexOf(file)).splice(1);
    }
    else if (cmd.flags.c || cmd.flags.command) {
      options.options = cmd.argv.splice(cmd.argv.indexOf(cmd.flags.c || cmd.flags.command) + 1);
    }

    //
    // Now that we've removed the target script options
    // reparse the options and configure the forever settings
    //
    argv = optimist(cmd.argv).boolean(['v', 'verbose', 'a', 'append', 's', 'silent']).argv;
    Object.keys(argv).forEach(function (key) {
      if (mappings[key] && argv[key]) {
        options[mappings[key]] = argv[key];
      }
    });

    if (typeof options['max'] === 'undefined') {
      //
      // If max isn't specified set it to run forever
      //
      options.forever = true;
    }

    if (typeof options['minUptime'] !== 'undefined') {
      options['minUptime'] = parseFloat(options['minUptime']);
    }
    if (typeof options['spinSleepTime'] !== 'undefined') {
      options['spinSleepTime'] = parseFloat(options['spinSleepTime']);
    }

    if (!options.sourceDir) {
      //
      // Set the sourceDir of the options for graceful
      // restarting outside of the main directory
      //
      options.sourceDir = file && file[0] !== '/' ? process.cwd() : '/';
    }

    uid = options.uid || utile.randomString(4);
    options.uid = uid;
    options.pidFile = options.pidFile || uid + '.pid';
    options.logFile = argv.l || uid + '.log';

    //
    // Check for existing global config and set each
    // key appropriately if it exists.
    //
    ['append', 'silent', 'verbose'].forEach(function (key) {
      var target = mappings[key],
          value = forever.config.get(key);

      if (value) {
        options[target] = options[target] || value === 'true';
      }
    });

    //
    // Pass the source dir to spawn
    //
    options.spawnWith = {
      cwd: options.sourceDir
    };

    //
    // Configure winston for forever based on the CLI options
    //
    if (options.verbose) {
      forever.log.transports.console.level = 'silly';
    }

    //
    // Setup configurations for forever
    //
    config = {
      root: cmd.flags.p
    };

    //
    // Only call `forever.load()` if the root path is different than
    // the default root exposed by forever.
    //
    if ((config.root && config.root !== forever.root)) {
      forever.log.silly('Loading forever with config: ', config);
      forever.load(config);
      forever.log.silly('Loaded forever successfully.');
    }

    next();
  });

  app.cli('/install', function (cmd, tty) {
    cmd.service.install(function onInstall(err) {
      if (err) {
        tty.error(err);
      }
      else {
        tty.info('foreverd installed');
      }
    });
  });

  //TODO
  app.cli('/run', function (cmd, tty) {
    cmd.service.load(function () {
      cmd.service.run();
    });
  });

  app.cli('/uninstall', function (cmd, tty) {
    cmd.service.uninstall();
  });

  app.cli('/add/*', function (cmd, tty) {
    cmd.service.add(cmd.file, cmd.options);
  });

  //TODO
  app.cli('/remove', function (cmd, tty) {
    cmd.service.remove(cmd.file, cmd.options);
  });

  app.cli('/start', function (cmd, tty) {
    cmd.service.start();
  });

  //TODO
  app.cli('/stop', function (cmd, tty) {
    cmd.service.stop();
  });

  app.cli('/restart', function (cmd, tty) {
    cmd.service.restart();
  });

  app.cli('/list', function (cmd, tty) {
    cmd.service.list(function (err, applications) {
      applications.forEach(function printApplication(application) {
        console.log(application.monitor.uid, application.monitor.command, application.file, application.monitor.child.pid, application.monitor.logFile, application.monitor.pidFile);
      });
    });
  });

  app.cli('/pause', function (cmd, tty) {
    cmd.service.pause();
  });
  
  app.cli('/resume', function (cmd, tty) {
    cmd.service.resume();
  });
};

