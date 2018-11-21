var shell = require('shelljs');
var parseGitUrl = require('git-url-parse');

module.exports.exec = function exec(command) {
  console.log("   executing: " + command);
  var options = { silent: true };
  var ref = shell.exec(command, options);
  if (ref.code === 0) {
   return ref.stdout.trim();
  }

  var message =
    'Exec code(' + ref.code + ') on executing: ' + command + '\n' +
    shell.stderr;

  throw new Error(message);
};

module.exports.getGHPagesUrl = function getGHPagesUrl(ghUrl) {
  var parsedUrl = parseGitUrl(ghUrl);
  var ghPagesUrl;
  if (parsedUrl.resource === 'github.com') {
    ghPagesUrl = 'https://' + parsedUrl.owner + '.github.io/' + parsedUrl.name + '/';
  } else { // Github Enterprise
    ghPagesUrl = 'https://' + parsedUrl.resource + '/pages/' + parsedUrl.full_name + '/';
  }
  
  return ghPagesUrl;
};

  module.exports.createHTML = function(baseURL, links){
    return `
    <!DOCTYPE html>
        <head>
            <meta charset="utf-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>SVH Storybook</title>
            <meta name="description" content="">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="https://unpkg.com/github-markdown-css@2.10.0/github-markdown.css">
        </head>
        <body>
            <h1>Storybook Branch Links</h1>
            <ul>
              ${links.map( link => `<li><a href=${baseURL + link}><p>${link}</p></a></li>`).join('')}
            </ul>
        </body>
    </html>
    `
};


function flattenArray(arr1) {
  return arr1.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenArray(val)) : acc.concat(val), []);
}

module.exports.flattenArray = flattenArray