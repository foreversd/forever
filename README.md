# forever

A simple CLI tool for ensuring that a given script runs continuously (i.e. forever).

## Installation

### Installing npm (node package manager)
```
  curl http://npmjs.org/install.sh | sh
```

### Installing forever
```
  [sudo] npm install forever -g
```

## Usage
There are two distinct ways to use forever: through the command line interface, or by requiring the forever module in your own code.

### Using forever from the command line
You can use forever to run any kind of script continuously (whether it is written in node.js or not). The usage options are simple:

```
  usage: forever [action] [options] SCRIPT [script-options]

  Monitors the script specified in the current process or as a daemon

  actions:
    start            Start SCRIPT as a daemon
    stop             Stop the daemon SCRIPT
    stopall          Stop all running forever scripts
    restart          Restart the daemon SCRIPT
    list             List all running forever scripts
    config           Lists all forever user configuration
    set <key> <val>  Sets the specified forever config <key>
    clear <key>      Clears the specified forever config <key>
    cleanlogs        [CAREFUL] Deletes all historical forever log files

  options:
    -m MAX         Only run the specified script MAX times
    -l  LOGFILE    Logs the forever output to LOGFILE
    -o  OUTFILE    Logs stdout from child script to OUTFILE
    -e  ERRFILE    Logs stderr from child script to ERRFILE
    -d  SOURCEDIR  The source directory for which SCRIPT is relative to
    -p  PATH       Base path for all forever related files (pid files, etc.)
    -c  COMMAND    COMMAND to execute (defaults to node)
    --pidfile      The pid file
    -a, --append   Append logs
    -v, --verbose  Turns on the verbose messages from Forever
    -s, --silent   Run the child script silencing stdout and stderr
    -h, --help     You're staring at it

  [Long Running Process]
    The forever process will continue to run outputting log messages to the console.
    ex. forever -o out.log -e err.log my-script.js

  [Daemon]
    The forever process will run as a daemon which will make the target process start
    in the background. This is extremely useful for remote starting simple node.js scripts
    without using nohup. It is recommended to run start with -o -l, & -e.
    ex. forever start -l forever.log -o out.log -e err.log my-daemon.js
        forever stop my-daemon.js
```

There are several samples designed to test the fault tolerance of forever. Here's a simple example:

<pre>
  forever samples/error-on-timer.js -m 5
</pre>

### Using an instance of Forever from node.js
You can also use forever from inside your own node.js code.

```javascript
  var forever = require('forever');

  var child = new (forever.Forever)('your-filename.js', {
    max: 3,
    silent: true,
    options: []
  });

  child.on('exit', this.callback);
  child.start();
```

### Spawning a non-node process
You can spawn non-node processes too. Either set the `command` key in the
`options` hash or pass in an `Array` in place of the `file` argument like this:

```javascript
  var forever = require('forever');
  var child = forever.start([ 'perl', '-le', 'print "moo"' ], {
    max : 1,
    silent : true
  });
```

### Options available when using Forever in node.js
There are several options that you should be aware of when using forever:

```javascript
  {
    'max': 10,                  // Sets the maximum number of times a given script should run
    'forever': true,            // Indicates that this script should run forever
    'silent': true,             // Silences the output from stdout and stderr in the parent process
    'logFile': 'path/to/file',  // Path to log output from forever process (when in daemon)
    'pidFile': 'path/to/file',  // Path to put pid information for the process(es) started
    'outFile': 'path/to/file',  // Path to log output from child stdout
    'errFile': 'path/to/file',  // Path to log output from child stderr
    'command': 'perl',          // Binary to run (default: 'node')
    'options': ['foo','bar'],   // Additional arguments to pass to the script
  }
```

### Events available when using an instance of Forever in node.js
Each forever object is an instance of the node.js core EventEmitter. There are several core events that you can listen for:

* error   [err]:          Raised when an error occurs
* stop    [process]:      Raised when the target script is stopped by the user
* save    [path, data]:   Raised when the target Forever object persists the pid information to disk.
* restart [forever]:      Raised each time the target script is restarted
* exit    [forever]:      Raised when the call to forever.run() completes
* stdout  [data]:         Raised when data is received from the child process' stdout
* stderr  [data]:         Raised when data is received from the child process' stderr

## Using forever module from node.js
In addition to using a Forever object, the forever module also exposes some useful methods. Each method returns an instance of an EventEmitter which emits when complete. See the [forever cli commands][1] for sample usage.

### forever.load (config, callback)
Sets the specified configuration (config) for the forever module. In addition to the callback, this method also returns an event emitter which will raise the 'load' event when complete. There are two important options:

* root:    Directory to put all default forever log files
* pidPath: Directory to put all forever *.pid files

### forever.start (file, options)
Starts a script with forever.

### forever.startDaemon (file, options)
Starts a script with forever as a daemon. WARNING: Will daemonize the current process.

### forever.stop (index)
Stops the forever daemon script at the specified index. These indices are the same as those returned by forever.list(). This method returns an EventEmitter that raises the 'stop' event when complete.

### forever.stopAll (format)
Stops all forever scripts currently running. This method returns an EventEmitter that raises the 'stopAll' event when complete.

### forever.list (format, procs)
Returns a list of metadata objects about each process that is being run using forever. This method is synchronous and will return the list of metadata as such.

### forever.cleanup ()
Cleans up any extraneous forever *.pid or *.fvr files that are on the target system. This method returns an EventEmitter that raises the 'cleanUp' event when complete.

### forever.cleanLogsSync (processes)
Removes all log files from the root forever directory that do not belong to current running forever processes.

## Run Tests
The test coverage for 0.3.1 is currently lacking, but will be improved in 0.3.2.
```
  vows test/*-test.js --spec
```

#### Author: [Charlie Robbins][0]
#### Contributors: [Fedor Indutny](http://github.com/donnerjack13589), [James Halliday](http://substack.net/)

[0]: http://nodejitsu.com
[1]: https://github.com/indexzero/forever/blob/master/lib/forever/cli.js