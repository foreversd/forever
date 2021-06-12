var path = require('path');
var fs = require('fs');
var Configstore = require('configstore');

function initConfigFile(foreverRoot) {
  try {
    return new Configstore('config', undefined, {
      "configPath" : path.join(foreverRoot, 'config.json')
    });
  } catch (err) {
    return new Configstore()
  }
}

//
// Synchronously create the `root` directory
// and the `pid` directory for forever. Although there is
// an additional overhead here of the sync action. It simplifies
// the setup of forever dramatically.
//
function tryCreateDir(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, '0755');
    }
  }
  catch (error) {
    throw new Error('Failed to create directory '+dir+":" +error.message);
  }
}

module.exports = {
  initConfigFile: initConfigFile,
  tryCreateDir: tryCreateDir
};
