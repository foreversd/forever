const { execCommand } = require('cli-testlab');
const rootDir = '.';

describe('cli', () => {
  describe('start', () => {
    it('starts script successfully', async () => {
      const oldDir = process.cwd();
      process.chdir('test/mocha/cli/scripts/dir with spaces/');
      await execCommand(
        `node ../../../../../bin/forever start script_name.js`,
        {
          expectedOutput: ['Forever processing file:', 'script_name.js']
        }
      );

      await execCommand(`node ../../../../../bin/forever stopall`, {
        expectedOutput: 'dir with spaces\\script_name.js',
      });
      process.chdir(oldDir);
    });
  });
});
