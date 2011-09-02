/*
 * spawn-and-error.js: Sample script that spawns a simple child process and errors
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */
 
var util = require('util'),
    path = require('path'),
    spawn = require('child_process').spawn;
    
var child = spawn('node', [path.join(__dirname, 'count-timer.js')], { cwd: __dirname });

child.stdout.on('data', function (data) {
  util.puts(data);
  //throw new Error('User generated fault.');
});

child.stderr.on('data', function (data) {
  util.puts(data);
});

child.on('exit', function (code) {
  util.puts('Child process exited with code: ' + code);
});
