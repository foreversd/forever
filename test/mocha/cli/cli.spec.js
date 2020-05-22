const { delayPromise } = require('../../helpers/utils');

const { execCommand } = require('cli-testlab');

describe('cli', () => {
  describe('start', () => {
    it('starts script successfully', () => {
      const oldDir = process.cwd();
      process.chdir('test/mocha/cli/scripts/dir with spaces/');
      return execCommand(
        `node ../../../../../bin/forever start script_name.js`,
        {
          expectedOutput: ['Forever processing file:', 'script_name.js'],
        }
      )
        .then(() => {
          return delayPromise(1000);
        })
        .then(() => {
          return execCommand(`node ../../../../../bin/forever stopall`, {
            expectedOutput: ['Forever stopped processes', 'script_name.js'],
          });
        })
        .then(() => {
          process.chdir(oldDir);
        });
    });
  });
});
