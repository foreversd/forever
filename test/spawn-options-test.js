/*
 * forever-test.js: Tests for forever module
 *
 * (C) 2010 and Charlie Robbins
 * MIT LICENCE
 *
 */

var sys = require('sys'),
    assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../lib/forever'),
    helpers = require('./helpers');

vows.describe('forever').addBatch({
  "When using forever": {
    "an instance of forever.Monitor with valid options": {
      "passing environment variables to env-vars.js": {
        topic: function () {
          var that = this, child;
          
          this.env = {
            FOO: 'foo', 
            BAR: 'bar'
          };
          
          child = new (forever.Monitor)(path.join(__dirname, '..', 'examples', 'env-vars.js'), {
            max: 1,
            silent: true,
            minUptime: 0,
            env: this.env
          });

          child.on('stdout', function (data) {
            that.stdout = data.toString();
          });
          
          child.on('exit', this.callback.bind({}, null));
          child.start();
        },
        "should pass the environment variables to the child": function (err, child) {
          assert.equal(child.times, 1);
          assert.equal(this.stdout, JSON.stringify(this.env));
        }
      },
      "passing a custom cwd to custom-cwd.js": {
        topic: function () {
          var that = this, child;
          
          this.cwd = path.join(__dirname, '..');
          
          child = new (forever.Monitor)(path.join(__dirname, '..', 'examples', 'custom-cwd.js'), {
            max: 1,
            silent: true,
            minUptime: 0,
            cwd: this.cwd
          });

          child.on('stdout', function (data) {
            that.stdout = data.toString();
          });
          
          child.on('exit', this.callback.bind({}, null));
          child.start();
        },
        "should setup the child to run in the target directory": function (err, child) {
          assert.equal(child.times, 1);
          assert.equal(this.stdout, this.cwd);
        }
      }
    }
  }
}).export(module);
