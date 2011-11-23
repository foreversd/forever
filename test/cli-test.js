/*
 * cli-test.js: Tests for forever CLI
 *
 * (C) 2011 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var fs = require('fs'),
    path = require('path'),
    assert = require('assert'),
    vows = require('vows'),
    helpers = require('./helpers'),
    rimraf = require('utile').rimraf,
    forever = require('../lib/forever');

var script = path.join(__dirname, '..', 'examples', 'log-on-interval.js'),
    options = ['--uid', 'itShouldNotGoToUIDField'];

vows.describe('forever/cli').addBatch({
  'When using forever CLI': {
    "when ~/.forever/sock is empty": {      
      topic: function () {
        rimraf(path.join(process.env.HOME, '.forever', 'sock'), this.callback);
      },
      'and starting script using `forever start`': helpers.spawn(['start', script], {
        '`forever.list` result': helpers.list({
          'should contain spawned process': function (list) {
            helpers.assertList(list);
            assert.equal(list[0].command, 'node');
            assert.equal(fs.realpathSync(list[0].file), fs.realpathSync(script));
            helpers.assertStartsWith(list[0].logFile, forever.config.get('root'));
          },
          'and stopping it using `forever stop`': helpers.spawn(['stop', script], {
            '`forever.list` result': helpers.list({
              'should not contain previous process': function (list) {
                assert.isNull(list);
              }
            })
          })
        })
      })
    }
  }
}).addBatch({
  'When using forever CLI': {
    'and starting script using `forever start` with arguments': helpers.spawn(['start', script].concat(options), {
      '`forever.list` result': helpers.list({
        'should contain spawned process with proper options': function (list) {
          helpers.assertList(list);
          assert.notEqual(list[0].uid, 'itShouldNotGoToUIDField');
          assert.deepEqual(list[0].options, options);
        }
      })
    })
  }
}).addBatch({
  'When testing forever CLI': {
    'necessary cleanup': {
      topic: function () {
        forever.stopAll().on('stopAll', this.callback.bind({}, null));
      },
      'should take place': function () {}
    }
  }
}).export(module);

