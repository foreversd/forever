/*
 * env-spawn-test.js: Tests for supporting environment variables in the forever module
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var assert = require('assert'),
    path = require('path'),
    vows = require('vows'),
    forever = require('../lib/forever'),
    helpers = require('./helpers');

vows.describe('forever/spawn-options').addBatch({
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
      },
      "setting `hideEnv` when spawning all-env-vars.js": {
        topic: function () {
          var that = this, child;

          this.hideEnv = [
            'USER',
            'OLDPWD'
          ];

          child = new (forever.Monitor)(path.join(__dirname, '..', 'examples', 'all-env-vars.js'), {
            max: 1,
            silent: true,
            minUptime: 0,
            hideEnv: this.hideEnv
          });

          child.on('stdout', function (data) {
            that.env = Object.keys(JSON.parse(data.toString()));
          });

          child.on('exit', this.callback.bind(this, null));
          child.start();
        },
        "should hide the environment variables passed to the child": function (err, child) {
          var that = this;

          assert.equal(child.times, 1);
          this.hideEnv.forEach(function (key) {
            assert.isTrue(that.env.indexOf(key) === -1);
          });
        }
      },
    }
  }
}).export(module);
