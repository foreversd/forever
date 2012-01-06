
var fs = require('fs');

exports.name = 'logger';

exports.attach = function (options) {
  options = options || {};
  var monitor = this;
  
  // If we should log stdout, open a file buffer
  if (this.outFile || options['stdout']) {
    this.stdout = options['stdout'] || fs.createWriteStream(this.outFile, { 
      flags: 'a+', 
      encoding: 'utf8', 
      mode: '0666' 
    });
  }
  
  // If we should log stderr, open a file buffer
  if (this.errFile || options['stderr']) {
    this.stderr = options['stderr'] || fs.createWriteStream(this.errFile, { 
      flags: 'a+', 
      encoding: 'utf8', 
      mode: '0666'
    });
  }

  function startLogging() {
    //
    // Helper function to log output.
    //
    function logStream(stream) {
      //
      // Logs the specified `data` to the `stream`.
      //
      function onData(data) {
        try { monitor.log.write(data) }
        catch (ex) { }

        if (!monitor.silent && !monitor[stream]) {
          //
          // If we haven't been silenced, and we don't have a file stream
          // to output to write to the process stdout stream
          //
          process[stream].write(data);
        }
        else if (monitor[stream]) {
          //
          // If we have been given an output file for the stream, write to it
          //
          monitor[stream].write(data);
        }
        
        monitor.emit(stream, data);
      }
      
      monitor.child[stream].on('data', onData);
      monitor.child.once('exit', function () {
        monitor.child[stream].removeListener('data', logStream);
      });
    }
    
    logStream('stdout');
    logStream('stderr');
  }
  
  function stopLogging() {
    function closeStream(stream) {
      if (monitor[stream]) {
        //
        // Close the stream only if it wasn't provided in `options`. If it was,
        // caller is responsible for closing it.
        //
        monitor[stream].end();
      }
    }
    
    closeStream('stdout');
    closeStream('stderr');
    monitor.log.end();
  }

  this.on('start', startLogging);
  this.on('restart', startLogging);
  this.on('exit', stopLogging);
};

