/*
 * hook-test.js: Tests for forever-based hooks
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

 var assert = require('assert'),
     path = require('path'),
     vows = require('vows'),
     forever = require('../lib/forever'),
     TestHook = require('./fixtures/test-hook').TestHook;

 vows.describe('forever/spin-restart').addBatch({
   "When using forever": {
     "and spawning a script that spin restarts": {
       "with a simple hook": {
         topic: function () {
           var script = path.join(__dirname, '..', 'examples', 'always-throw.js'),
               hook = new TestHook(),
               child;
               
           child = new (forever.Monitor)(script, { 
             silent: true, 
             max: 1,
             hooks: [hook]
           });

           hook.on('hook-exit', this.callback.bind(null, null));
           child.start();
         },
         "should raise the `hook-exit` event": function (err, child, spinning) {
           assert.isNull(err);
         }
       }
     }
   }
 }).export(module);
