# forever

A simple CLI tool for ensuring that a given script runs continuously (i.e. forever).

## Installation

### Installing npm (node package manager)
<pre>
  curl http://npmjs.org/install.sh | sh
</pre>

### Installing forever
<pre>
  [sudo] npm install forever
</pre>

## Usage 
There are two distinct ways to use forever: through the command line interface, or by requiring the forever module in your own code.  

### Using forever from the command line
You can use forever to run any kind of script continuously (whether it is written in node.js or not). The usage options are simple:

<pre>
  usage: forever [start | stop | stopall | list] [options] SCRIPT [script options]

  options:
    start          start SCRIPT as a daemon
    stop           stop the daemon SCRIPT
    stopall        stop all running forever scripts
    list           list all running forever scripts

    -m MAX         Only run the specified script MAX times
    -l  LOGFILE    Logs the forever output to LOGFILE
    -o  OUTFILE    Logs stdout from child script to OUTFILE
    -e  ERRFILE    Logs stderr from child script to ERRFILE
    -p  PATH       Base path for all forever related files (pid files, etc.)
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
</pre>

There are several samples designed to test the fault tolerance of forever. Here's a simple example: 

<pre>
  forever samples/error-on-timer.js -m 5
</pre>

### Using forever from node.js 
You can also use forever from inside your own node.js code. 

<pre>
  var forever = require('forever');
  
  var child = new (forever.Forever)('your-filename.js'), {
    max: 3,
    silent: true,
    options: []
  });
  
  child.on('exit', this.callback);
  child.start();
</pre>

### Options available when using Forever in node.js
There are several options that you should be aware of when using forever:

<pre>
  {
    'max': 10,                  // Sets the maximum number of times a given script should run
    'forever': true,            // Indicates that this script should run forever 
    'silent': true,             // Silences the output from stdout and stderr in the parent process
    'logfile': 'path/to/file',  // Path to log output from forever process (when in daemon)
    'pidfile': 'path/to/file',  // Path to put pid information for the process(es) started
    'outfile': 'path/to/file',  // Path to log output from child stdout
    'errfile': 'path/to/file',  // Path to log output from child stderr
  }
</pre>

### Events available when using Forever in node.js
Each forever object is an instance of the node.js core EventEmitter. There are several core events that you can listen for:

* restart [err, forever]: Raised each time the target script is restarted
* exit    [err, forever]: Raised when the call to forever.run() completes
* stdout  [err, data]:    Raised when data is received from the child process' stdout
* stderr  [err, data]:    Raised when data is received from the child process' stderr

## Run Tests
<pre>
  vows test/*-test.js --spec
</pre>

#### Author: [Charlie Robbins](http://www.charlierobbins.com)
#### Contributors: [Fedor Indutny](http://github.com/donnerjack13589)
