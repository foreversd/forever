var Logger = module.exports;

Logger.name = 'logger';

Logger.attach = function (options) {
  var self = this;

  this.on('start', function () {
    startLogging('stdout');
    startLogging('stderr');

    function startLogging(stream) {
      self.child[stream].on('data', onData);

      if (options[stream]) {
        self[stream] = options[stream]
      }

      function onData(data) {
        if (!self.silent && !self[stream]) {
          //
          // If we haven't been silenced, and we don't have a file stream
          // to output to write to the process stdout stream
          //
          process[stream].write(data);
        }
        else if (self[stream]) {
          //
          // If we have been given an output file for the stream, write to it
          //
          self[stream].write(data);
        }
      }

      function stopLogging() {
        if (self[stream] && !options[stream]) {
          //
          // Close the stream only if it wasn't provided in `options`. If it was,
          // caller is responsible for closing it.
          //
          self[stream].close();
        }
      };

      self.on('exit', stopLogging);
    }
  });
};

Logger.init = function (done) {
  done();
};

