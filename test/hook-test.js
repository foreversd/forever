/*
 * hook-test.js: Tests for forever-based hooks
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
     TestHook = require('./fixtures/test-hook').TestHook;

 vows.describe('forever/spin-restart').addBatch({
   "When using forever": {
     "and spawning a script that spin restarts": {
       "with a simple hook": {
         topic: function () {
           var script = path.join(__dirname, '..', 'examples', 'always-throw.js'),
               child;
               
           child = new (forever.Monitor)(script, { 
             silent: true, 
             max: 1,
             hooks: [
               new TestHook()
             ]
           });

           child.on('exit', this.callback.bind({}, null));
           child.start();
         },
         "should raise the `hook-exit` event": function (err, child, spinning) {
           assert.isTrue(spinning);
         }
       }
     }
   }
 }).export(module);
