/*
 * watch-test.js: Tests for restarting forever processes when a file changes.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENSE
 *
 */

var assert = require('assert'),
    path = require('path'),
    fs = require('fs'),
    vows = require('vows'),
    forever = require('../lib/forever');

vows.describe('forever/watch').addBatch({
  'When using forever with watch enabled': {
    'forever should': {
      topic: forever.start('daemon.js', {
        silent: true,
        options: ['-p', '8090'],
        watch: true,
        sourceDir: path.join(__dirname, 'fixtures', 'watch')
      }),
      'have correct options set': function (child) {
        assert.isTrue(child.watchIgnoreDotFiles);
        assert.equal(fs.realpathSync(path.join(__dirname, 'fixtures', 'watch')),
                     fs.realpathSync(child.watchDirectory));
      },
      'when file changes': {
        topic: function (child) {
          child.once('restart', this.callback);
          fs.writeFileSync(path.join(__dirname, 'fixtures', 'watch', 'file'),
                       '// hello, I know nodejitsu.');
        },
        'restart the script': function (child, _) {
          fs.writeFileSync(path.join(__dirname, 'fixtures', 'watch', 'file'),
                       '/* hello, I know nodejitsu. */');
        }
      },
      'when file is added': {
        topic: function (child) {
          child.once('restart', this.callback);
          fs.writeFileSync(path.join(__dirname, 'fixtures', 'watch', 'newFile'), '');
        },
        'restart the script': function (child, _) {
          fs.unlinkSync(path.join(__dirname, 'fixtures', 'watch', 'newFile'));
        }
      },
      'when file is removed': {
        topic: function (child) {
          child.once('restart', this.callback);
          fs.unlinkSync(path.join(__dirname, 'fixtures', 'watch', 'removeMe'));
        },
        'restart the script': function (child, _) {
          fs.writeFileSync(path.join(__dirname, 'fixtures', 'watch', 'removeMe'), '');
        }
      },
      'read .foreverignore file': {
        'and store ignore patterns': function (child) {
          assert.deepEqual(
            child.watchIgnorePatterns,
            fs.readFileSync(
              path.join(__dirname, 'fixtures', 'watch', '.foreverignore'),
              'utf8'
            ).split("\n")
          );
        }
      }
    }
  }
}).export(module);

