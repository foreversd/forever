/*
 * forever.js: Top level include for the forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    fs = require('fs'),
    eyes = require('eyes'),
    path = require('path'),
    events = require('events'),
    spawn = require('child_process').spawn,
    daemon = require('daemon');

var config,
    forever = exports;

forever.load = function (options, callback) {
  options.root    = options.root || path.join('/tmp', 'forever'),
  options.pidPath = options.pidPath || path.join(options.root, 'pids');
  config = options;
  
  // Create the two directories, ignoring errors
  fs.mkdir(config.root, 0755, function (err) { 
    fs.mkdir(config.pidPath, 0755, function (err2) { 
      callback();
    });
  });
};

// Export the core 'start' method
forever.start = function (file, options) {
  return new Forever(file, options).start();
};

forever.startDaemon = function (file, options) {
  options.logfile = options.logfile || 'forever.log';
  options.logfile = path.join(config.root, options.logfile);
  var runner = new Forever(file, options);
  
  fs.open(options.logfile, 'w+', function (err, fd) {
    try {
      daemon.start(fd);
      daemon.lock(path.join(config.root, options.pidFile));
      runner.start().save();
    }
    catch (ex) {
      // Ignore errors
    }
  });
};

forever.stop = function (file, options) {
  return new Forever(file, options).stop();
};

//
// function randomString (bits)
//   randomString returns a pseude-random ASCII string which contains at least the specified number of bits of entropy
//   the return value is a string of length ⌈bits/6⌉ of characters from the base64 alphabet
//
forever.randomString = function (bits) {
  var chars, rand, i, ret;
  chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  ret = '';
  
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

var Forever = function (file, options) {
  events.EventEmitter.call(this);
  
  options.options.unshift(file);
  options.silent = options.silent || false;
  options.forever = options.forever || false;
  options.logout = typeof options.logfile !== 'undefined';
  options.stdout = typeof options.outfile !== 'undefined';
  options.stderr = typeof options.errfile !== 'undefined';
  
  // If we should log stdout, open a file buffer 
  if (options.stdout) {
    this.stdout = fs.createWriteStream(options.outfile, { flags: 'a+', encoding: 'utf8', mode: 0666 });
  }
  
  // If we should log stderr, open a file buffer
  if (options.stderr) {
    this.stderr = fs.createWriteStream(options.errfile, { flags: 'a+', encoding: 'utf8', mode: 0666 });
  }
  
  this.times = 0;
  this.options = options;
};

sys.inherits(Forever, events.EventEmitter);

Forever.prototype.start = function () {
  var self = this, child = spawn('node', this.options.options);
  
  this.child = child;
  this.running = true;
  
  // Hook all stream data and process it
  function listenTo (stream) {
    child[stream].on('data', function (data) {
      // If we haven't been silenced, and we don't have a file stream
      // to output to write to the process stdout stream
      if (!self.options.silent && !self.options[stream]) {
        process.stdout.write(data);
      }
      
      // If we have been given an output file for the stream, write to it
      if (self.options[stream]) {
        self[stream].write(data);
      }
      
      self.emit(stream, data);
    });
  }
  
  // Listen to stdout and stderr
  listenTo('stdout');
  listenTo('stderr');
    
  child.on('exit', function (code) {
    self.log('Forever detected script exited with code: ' + code);
    self.times++;

    if (self.options.forever || self.times < self.options.max) {
      self.emit('restart', null, self);
      process.nextTick(function () {
        self.log('Forever restarting script for ' + self.times + ' time');
        self.start();
      });
    }
    else {
      this.running = false;
      
      // If had to write to an stdout file, close it
      if (self.options.stdout) {
        self.stdout.end();
      }
      
      // If had to write to an stderr file, close it
      if (self.options.stderr) {
        self.stderr.end();
      }
      
      self.emit('exit', null, self);
    }
  });
  
  // Chaining support
  return this;
};

Forever.prototype.save = function () {
  var self = this;
  if (!this.running) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot save Forever instance that is not running'));
    });
  }
  
  var childData = {
    pid: this.child.pid,
    foreverPid: process.pid,
    options: this.options.options.slice(1),
    file: this.options.options[0]
  };
  
  var childPath = path.join(config.pidPath, childData.pid + '.pid');
  fs.writeFile(childPath, JSON.stringify(childData), function (err) {
    // Ignore errors
  });
  
  // Chaining support
  return this;
};

Forever.prototype.log = function (message) {
  if (!this.options.silent) {
    sys.puts(message);
  }
}

Forever.prototype.stop = function () {
  //
  // Remark: This is not implemented in 0.2.1
  //
  
  // Chaining support
  return this;
};

// Export the Forever object
forever.Forever = Forever;