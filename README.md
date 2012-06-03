# forever

A simple CLI tool for ensuring that a given script runs continuously (i.e. forever).

## Installation

### Installing npm (node package manager)
``` bash
  curl http://npmjs.org/install.sh | sh
```

### Installing forever
``` bash
  $ [sudo] npm install forever -g
```

**Note:** If you are using forever _programatically_ you should not install it globally. 

``` bash
  $ cd /path/to/your/project
  $ [sudo] npm install forever
```

## Usage
There are two distinct ways to use forever: through the command line interface, or by requiring the forever module in your own code.

### Using forever from the command line
You can use forever to run any kind of script continuously (whether it is written in node.js or not). The usage options are simple:

```
  $ forever --help
  usage: forever [options] [action] SCRIPT [script-options]

  Monitors the script specified in the current process or as a daemon

  actions:
    start               Start SCRIPT as a daemon
    stop                Stop the daemon SCRIPT
    stopall             Stop all running forever scripts
    restart             Restart the daemon SCRIPT
    restartall          Restart all running forever scripts
    list                List all running forever scripts
    config              Lists all forever user configuration
    set <key> <val>     Sets the specified forever config <key>
    clear <key>         Clears the specified forever config <key>
    logs                Lists log files for all forever processes
    logs <script|index> Tails the logs for <script|index>
    columns add <col>   Adds the specified column to the output in `forever list`
    columns rm <col>    Removed the specified column from the output in `forever list`
    columns set <cols>  Set all columns for the output in `forever list`
    cleanlogs           [CAREFUL] Deletes all historical forever log files

  options:
    -m  MAX          Only run the specified script MAX times
    -l  LOGFILE      Logs the forever output to LOGFILE
    -o  OUTFILE      Logs stdout from child script to OUTFILE
    -e  ERRFILE      Logs stderr from child script to ERRFILE
    -p  PATH         Base path for all forever related files (pid files, etc.)
    -c  COMMAND      COMMAND to execute (defaults to node)
    -a, --append     Append logs
    --pidFile        The pid file
    --sourceDir      The source directory for which SCRIPT is relative to
    --minUptime      Minimum uptime (millis) for a script to not be considered "spinning"
    --spinSleepTime  Time to wait (millis) between launches of a spinning script.
    --plain          Disable command line colors
    -d, --debug      Forces forever to log debug output
    -v, --verbose    Turns on the verbose messages from Forever
    -s, --silent     Run the child script silencing stdout and stderr
    -w, --watch      Watch for file changes
    --watchDirectory Top-level directory to watch from
    -h, --help       You're staring at it

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

There are several examples designed to test the fault tolerance of forever. Here's a simple usage example:

``` bash
  $ forever -m 5 examples/error-on-timer.js
```

### Using an instance of Forever from node.js
You can also use forever from inside your own node.js code.

``` js
  var forever = require('forever');

  var child = new (forever.Monitor)('your-filename.js', {
    max: 3,
    silent: true,
    options: []
  });

  child.on('exit', this.callback);
  child.start();
```

**Remark:** As of `forever@0.6.0` processes will not automatically be available in `forever.list()`. In order to get your processes into `forever.list()` or `forever list` you must instantiate the `forever` socket server:

``` js
  forever.startServer(child);
```

### Spawning a non-node process
You can spawn non-node processes too. Either set the `command` key in the
`options` hash or pass in an `Array` in place of the `file` argument like this:

``` js
  var forever = require('forever');
  var child = forever.start([ 'perl', '-le', 'print "moo"' ], {
    max : 1,
    silent : true
  });
```

### Options available when using Forever in node.js
There are several options that you should be aware of when using forever. Most of this configuration is optional.

``` js
  {
    //
    // Basic configuration options
    //
    'silent': false,            // Silences the output from stdout and stderr in the parent process
    'uid': 'your-UID'           // Custom uid for this forever process. (default: autogen)
    'pidFile': 'path/to/a.pid', // Path to put pid information for the process(es) started
    'max': 10,                  // Sets the maximum number of times a given script should run
    'killTree': true            // Kills the entire child process tree on `exit`
    
    //
    // These options control how quickly forever restarts a child process
    // as well as when to kill a "spinning" process
    //
    'minUptime': 2000,     // Minimum time a child process has to be up. Forever will 'exit' otherwise.
    'spinSleepTime': 1000, // Interval between restarts if a child is spinning (i.e. alive < minUptime).
    
    //
    // Command to spawn as well as options and other vars 
    // (env, cwd, etc) to pass along
    //
    'command': 'perl',         // Binary to run (default: 'node')
    'options': ['foo','bar'],  // Additional arguments to pass to the script,
    'sourceDir': 'script/path' // Directory that the source script is in
    
    //
    // Options for restarting on watched files.
    //
    'watch': false              // Value indicating if we should watch files.
    'watchIgnoreDotFiles': null // Dot files we should read to ignore ('.foreverignore', etc).
    'watchIgnorePatterns': null // Ignore patterns to use when watching files.
    'watchDirectory': null      // Top-level directory to watch from.
    
    //
    // All or nothing options passed along to `child_process.spawn`.
    //
    'spawnWith': {
      env: process.env,        // Information passed along to the child process
      customFds: [-1, -1, -1], // that forever spawns.
      setsid: false
    },
    
    //
    // More specific options to pass along to `child_process.spawn` which 
    // will override anything passed to the `spawnWith` option
    //
    'env': { 'ADDITIONAL': 'CHILD ENV VARS' }
    'cwd': '/path/to/child/working/directory'
    
    //
    // Log files and associated logging options for this instance
    //
    'logFile': 'path/to/file', // Path to log output from forever process (when daemonized)
    'outFile': 'path/to/file', // Path to log output from child stdout
    'errFile': 'path/to/file'  // Path to log output from child stderr
  }
```

### Events available when using an instance of Forever in node.js
Each forever object is an instance of the node.js core EventEmitter. There are several core events that you can listen for:

* **error**   _[err]:_             Raised when an error occurs
* **start**   _[process, data]:_   Raised when the target script is first started.
* **stop**    _[process]:_         Raised when the target script is stopped by the user
* **restart** _[forever]:_         Raised each time the target script is restarted
* **exit**    _[forever]:_         Raised when the target script actually exits (permenantly).
* **stdout**  _[data]:_            Raised when data is received from the child process' stdout
* **stderr**  _[data]:_            Raised when data is received from the child process' stderr

## Using forever module from node.js
In addition to using a Forever object, the forever module also exposes some useful methods. Each method returns an instance of an EventEmitter which emits when complete. See the [forever cli commands][1] for sample usage.

### forever.load (config)
_Synchronously_ sets the specified configuration (config) for the forever module. There are two important options:

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

### forever.list (format, callback)
Returns a list of metadata objects about each process that is being run using forever. This method is synchronous and will return the list of metadata as such. Only processes which have invoked `forever.startServer()` will be available from `forever.list()`

### forever.tail (target, [length,] callback)
Responds with the logs from the target script(s) from `tail`. If `length` is provided it is used as the `-n` parameter to `tail`.

### forever.cleanUp ()
Cleans up any extraneous forever *.pid files that are on the target system. This method returns an EventEmitter that raises the 'cleanUp' event when complete.

### forever.cleanLogsSync (processes)
Removes all log files from the root forever directory that do not belong to current running forever processes.

## Run Tests

``` bash
  $ npm test
```

#### Author: [Charlie Robbins][0]
#### Contributors: [Fedor Indutny](http://github.com/donnerjack13589), [James Halliday](http://substack.net/)

[0]: http://nodejitsu.com
[1]: https://github.com/nodejitsu/forever/blob/master/lib/forever/cli.js
