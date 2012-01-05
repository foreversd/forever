/*
 * multiple-workers-test.js: Tests for spawning multiple workers with forever
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    net = require('net'),
    path = require('path'),
    request = require('request'),
    vows = require('vows'),
    forever = require('../../lib/forever');

function assertRunning(port) {
  return {
    topic: function () {
      request('http://127.0.0.1:' + port, this.callback);
    },
    "should respond with `i know nodejitsu`": function (err, res, body) {
      assert.isNull(err);
      assert.equal(res.statusCode, 200);
      assert.equal(body, 'hello, i know nodejitsu.');
    }
  }
}

vows.describe('forever/workers/multiple').addBatch({
  "When using forever": {
    "and spawning two processes using the same script": {
      topic: function () {
        var that = this,
            script = path.join(__dirname, '..', '..', 'examples', 'server.js');

        this.child1 = new (forever.Monitor)(script, {
          silent: true,
          maxRestart: 1,
          options: [ "--port=8080"]
        });
        
        this.child2 = new (forever.Monitor)(script, {
          silent: true,
          maxRestart: 1,
          options: [ "--port=8081"]
        });
        
        this.child1.on('start', function () {
          that.child2.on('start', function () {
            setTimeout(function () {
              forever.startServer(that.child1, that.child2, that.callback);
            }, 1000);
          });
          
          that.child2.start()
        });

        this.child1.start();
      },
      "should respond with no error": function (err, workers) {
        assert.isTrue(!err);
        assert.lengthOf(workers, 2);
        assert.equal(workers[0].monitor, this.child1);
        assert.equal(workers[1].monitor, this.child2);
        workers.forEach(function (worker) {
          assert.instanceOf(worker, forever.Worker);
        });
      },
      "requests against the first child": assertRunning(8080),
      "requests against the second child": assertRunning(8081)
      //
      // TODO: We should cleanup these processes.
      //
    }
  },
}).export(module);
