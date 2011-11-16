/*
 * multiple-processes-test.js: Tests for spawning multiple processes with forever
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    net = require('net'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../lib/forever');

vows.describe('forever/multiple-processes').addBatch({
  "When using forever": {
    "and spawning two processes using the same script": {
      topic: function () {
        var that = this,
            output = ''
            script = path.join(__dirname, '..', 'examples', 'server.js');

        this.child1 = new (forever.Monitor)(script, {
          silent: true,
          maxRestart: 1,
          options: [ "--port=8080"]
        });

        that.child1.on('start', function () {
          that.child2 = new (forever.Monitor)(script, {
            silent: true,
            maxRestart: 1,
            options: [ "--port=8081"]
          });
          
          function buildJson (data) {
            var json;
            
            try {
              output += data;
              json = JSON.parse(output.toString());
              that.callback(null, json);
            }
            catch (ex) {
              //
              // Do nothing here
              //
            }
          }

          that.child2.on('start', function () {
            forever.startServer(that.child1, that.child2, function (err, server, socketPath) {
              var socket = new net.Socket();
              socket.on('data', buildJson);
              socket.on('error', that.callback);
              socket.connect(socketPath);
            });
          });

          that.child2.start();
        });

        that.child1.start();
      },
      "should spawn both processes appropriately": function (err, data) {
        assert.isNull(err);
        assert.equal(data.monitors.length, 2);
        this.child1.stop();
        this.child2.stop();
      }
    }
  },
}).export(module);
