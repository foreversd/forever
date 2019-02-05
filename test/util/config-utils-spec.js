var fs = require('fs');
var configUtils = require('../../lib/util/config-utils');
var expect = require('chai').expect;

describe('config-utils', () => {
  describe('tryCreateDir', () => {
    it('happy path', () => {
      expect(() => {
        configUtils.tryCreateDir('happypath');
      }).to.not.throw();

      expect(fs.existsSync('happypath')).to.equal(true);
      fs.rmdirSync('happypath');
    });

    it('throws an error on invalid directory', () => {
      expect(() => {
        configUtils.tryCreateDir('');
      }).to.throw(/Failed to create directory :ENOENT: no such file or directory, mkdir/);
    });

    it('does not fail when creating directory that already exists', () => {
      expect(() => {
        configUtils.tryCreateDir('dummy');
        configUtils.tryCreateDir('dummy');
      }).to.not.throw();
      fs.rmdirSync('dummy');
    });
  });
});
