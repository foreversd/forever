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
    forever = require('../lib/forever');

var script = path.join(__dirname, '..', 'examples', 'log-on-interval.js');

vows.describe('forever/cli').addBatch({
  'When using forever CLI': {
    'and starting script using `forever start`': helpers.spawn(['start', script], {
      '`forever.list` result': helpers.list({
        'should contain spawned process': function (list) {
          assert.isNotNull(list);
          assert.lengthOf(list, 1);
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
}).export(module);

