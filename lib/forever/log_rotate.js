var Stream = require('stream').Stream;
var util = require('util');
var strftime = require('strftime');
var fs = require('fs');

module.exports = LogRotateStream;
function LogRotateStream(fileTemplate, checkInterval) {
  this.writable = true;
  this.readable = true;
  this.init = false;
  this.fileTemplate = fileTemplate;
  this.checkInterval = checkInterval;
  this.currentFile = strftime(fileTemplate);
  this._filestream = startFileStream(this.currentFile);
}
util.inherits(LogRotateStream, Stream);

LogRotateStream.prototype.write = function(data) {
  if (!this.init) {
    this.pipe(this._filestream);
    this.rotateFileStream();
    this.init = true;
  } 
  this.emit('data', data);
};

LogRotateStream.prototype.end = function() {
  this.emit('end');
};

LogRotateStream.prototype.destroy = function() {
  this.emit('close');
};

LogRotateStream.prototype.pause = function() {
  this.emit('pause');
};

LogRotateStream.prototype.rotateFileStream = function() {
  var newLogFile = strftime(this.fileTemplate);
  if (newLogFile != this.currentFile) {
    this.pause();
    this._filestream.destroySoon();
    this._filestream = startFileStream(newLogFile);
    this.pipe(this._filestream);
    this.currentFile = newLogFile;
  }
  var self = this;
  setTimeout(function() { self.rotateFileStream() }, this.checkInterval);
}

function startFileStream(file) {
  return fs.createWriteStream(file);
}
