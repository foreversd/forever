var assert = require('assert'),
  vows = require('vows'),
  moment = require('moment'),
  forever = require('../../lib/forever');

vows.describe('forever/core/uptime').addBatch({
  "When using forever" : {
    "calculates uptime" : {
      "for not running process correctly": function (err, procs) {
        assert.equal(forever.columns.uptime.get({}), 'STOPPED'.red);
      },
      "for running process correctly": function (err, procs) {
        var launchTime = moment.utc()
          .subtract(4000, 'days')
          .subtract(6, 'hours')
          .subtract(8, 'minutes')
          .subtract(25, 'seconds');

        var timeWithoutMsecs = forever.columns.uptime.get({
          running: true,
          ctime: launchTime.toDate().getTime()
        }).strip.split('.')[0];

        assert.equal(timeWithoutMsecs, '4000:6:8:25');
      }
    }
  }
}).export(module);
