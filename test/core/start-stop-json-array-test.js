/*
 * start-stop-json-test.js: start or stop forever using relative paths, the script path could be start with './', '../' ...
 *
 * (C) 2010 Charlie Robbins & the Contributors
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    path = require('path'),
    fs = require('fs'),
    vows = require('vows'),
    forever = require('../../lib/forever'),
    runCmd = require('../helpers').runCmd;

vows.describe('forever/core/start-stop-json-array').addBatch({
  "When using forever" : {
    "to start process using JSON configuration file containing an array" : {
      topic: function () {
        runCmd('start', [
          './test/fixtures/servers.json'
        ]);
        setTimeout(function (that) {
          forever.list(false, that.callback);
        }, 2000, this);
      },
      "the startup should works fine": function (err, procs) {
        assert.isNull(err);
        assert.isArray(procs);
        assert.equal(procs.length, 2);
      }
    }
  }
}).addBatch({
    "When the script is running" : {
      "try to stopall" : {
        topic: function () {
          runCmd('stopall', []);
          setTimeout(function (that) {
            forever.list(false, that.callback);
          }, 2000, this);
        },
        "the shut down should works fine": function (err, procs) {
          assert.isNull(err);
          assert.isNull(procs);
        }
      }
    }
  }).export(module);
