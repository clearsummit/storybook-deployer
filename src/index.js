var shell = require('shelljs');
var utils = require('.//utils');
var fs = require('fs')
var path = require('path');
var packageJson = require(path.resolve('./package.json'));
var parseRepo = require('parse-repo');


var defaultConfig = {
  gitUsername: 'GH Pages Bot',
  gitEmail: 'hello@ghbot.com',
  commitMessage: 'Deploy Storybook to GitHub Pages'
};

var config = Object.assign({}, defaultConfig, packageJson['storybook-deployer'] || defaultConfig);

var GH_PAGES = 'gh-pages';
var GENERATED_DIR = 'out' + Math.ceil(Math.random() * 9999);

function runScript(argv) {
  var SKIP_BUILD = Boolean(argv['existing-output-dir'])
  var OUTPUT_DIR = argv['existing-output-dir'] || GENERATED_DIR
  var GIT_REMOTE = argv['remote'] || 'origin';
  var TARGET_BRANCH = argv['branch'] || GH_PAGES;
  var SOURCE_BRANCH = argv['source-branch'] || 'master';
  var NPM_SCRIPT = argv['script'] || 'build-storybook';
  var CLEANUP_BRANCHES_ARGV = argv['cleanup-branches'] || 'true';
  var CLEANUP_BRANCHES = CLEANUP_BRANCHES_ARGV === 'true';
  var CI_DEPLOY = Boolean(argv['ci']);
  var HOST_TOKEN_ENV_VARIABLE = argv['host-token-env-variable'] || 'GH_TOKEN';
  var HOST_TOKEN = process.env[HOST_TOKEN_ENV_VARIABLE];

  // get GIT url
  console.log('=> Getting the git remote URL');
  var GIT_URL = utils.exec(`git config --get remote.${GIT_REMOTE}.url`);
  if (!GIT_URL) {
    console.log('This project is not configured with a remote git repo');
    process.exit(-1);
  }

  if (!SKIP_BUILD) {
    try {
      // clear and re-create the out directory
      shell.rm('-rf', OUTPUT_DIR);
      shell.mkdir(OUTPUT_DIR);

      // run our compile script
      console.log('=> Building storybook');
      if (packageJson.scripts[NPM_SCRIPT]) {
        utils.exec('npm run ' + NPM_SCRIPT + ' -- -o ' + OUTPUT_DIR);
      } else {
        utils.exec('node ./node_modules/.bin/build-storybook -o ' + OUTPUT_DIR);
      }
     } catch (e) {
        throw new Error('There was an error building the storybook. - ' + e.name + ': ' + e.message);
      }
    }

  // Get our repo's branches
  utils.exec('git fetch');
    var branches = utils.exec('git ls-remote --heads origin');
    branches = branches.split('\n')
    branches = branches.map(function (name) {
      name = name.replace(/(?:.+\srefs[\/]heads[\/])/, '').trim()
      return name
    }).filter(function (name) {
      return !!name
    })

    if (TARGET_BRANCH === GH_PAGES) {
      // This customizes the original script to update github pages with storybooks from new branches
      // and optionally cleans up old branches
      try {
        shell.mkdir(TARGET_BRANCH)
        shell.cd(TARGET_BRANCH)
        utils.exec('git init');

        utils.exec('git remote add origin ' + GIT_URL);

        utils.exec('git fetch');
        utils.exec('git checkout ' + TARGET_BRANCH);
        shell.mkdir('-p', SOURCE_BRANCH);

      } catch (e) {
        throw new Error('There was an setting up a repo to push to gh-pages. ' + e.name + ' : ' + e.message)
      }
      // copy all files in the branch directory
      var files_to_move = shell.ls('-l', path.join('..', OUTPUT_DIR))
      files_to_move.forEach(function (f) {
        shell.cp('-rf', path.join('..', OUTPUT_DIR, f.name), SOURCE_BRANCH)
      })

      // Cleanup any deleted branches
      if (CLEANUP_BRANCHES) {
        const storybook_files = ['favicon.ico', 'iframe.html', 'index.html', 'static'].join('')

        var list_sub_dirs = (a, b = '') => {
          if (!path.extname(b)) {
            var new_path = path.join(a, b)
            const files = shell.ls('-l', new_path).map(f => f.name)
            if (files.join('') == storybook_files) {
              return new_path
            }
            return files.map(b => {
              return list_sub_dirs(new_path, b)
            })
          }
        }

        var storybook_dirs = utils.flattenArray(list_sub_dirs('./')).filter(p => !!p)
        storybook_dirs.forEach(sb => {
          if (!branches.includes(sb)) {
            shell.rm('-rf', sb)
          }
        })
      }
      // End Cleanup

      // Write out links
      var baseURL = utils.getGHPagesUrl(GIT_URL)
      const indexHTML = utils.createHTML(branches.filter(b => b !== GH_PAGES))
      fs.writeFileSync('index.html', indexHTML);


      // End Write out links
    } else {
      // go to the out directory and create a *new* Git repo
      shell.cd(OUTPUT_DIR);
      utils.exec('git init');
    }
    try {
      if (CI_DEPLOY) {
        // inside this git repo we'll pretend to be a new user
        utils.exec('git config user.name ' + JSON.stringify(config.gitUsername));
        utils.exec('git config user.email ' + JSON.stringify(config.gitEmail));

        // disable GPG signing
        utils.exec('git config commit.gpgsign false');
      }
      utils.exec('git add .')
      utils.exec('git commit -m ' + JSON.stringify(config.commitMessage));
      utils.exec('git push --force --quiet')
    } catch (e) {
      throw new Error('There was an error pushing. Your story books may not have changed. ' + e.name + ' : ' + e.message)
    }

    // Force push from the current repo's source branch (master by default) to the remote
    // repo's gh-pages branch. (All previous history on the gh-pages branch
    // will be lost, since we are overwriting it.) We redirect any output to
    // /dev/null to hide any sensitive credential data that might otherwise be exposed.
    console.log('=> Deploying storybook');
    if (CI_DEPLOY) {
      var repositoryDetails = parseRepo(GIT_URL);

      if (repositoryDetails.host === 'github.com' && HOST_TOKEN) {
        GIT_URL = 'https://' + HOST_TOKEN + '@' + repositoryDetails.host + '/' + repositoryDetails.repository;
      }
    }

    if (TARGET_BRANCH !== GH_PAGES) {
      var rawgit_url = GIT_URL.replace('github.com', 'rawgit.com').replace('.git', '/') +
        TARGET_BRANCH + '/index.html';
      console.log('=> Storybook deployed to: ' + rawgit_url);
    } else {
      // We setup a tempo repo to deploy to github pages that needs to be cleaned up
      console.log('=> Storybook deployed to: ' + utils.getGHPagesUrl(GIT_URL));
    }
  }

  function cleanUp(argv) {
    var TARGET_BRANCH = argv['branch'] || GH_PAGES;
    var OUTPUT_DIR = argv['existing-output-dir'] || GENERATED_DIR
    var current_path = shell.pwd().split(path.sep)
    var current_dir = current_path[current_path.length - 1]

    // Unless we failed to build the storybook we should be in the gh-pages dir
    if (current_dir === GH_PAGES) {
      shell.cd('..');
    }
    shell.rm('-rf', OUTPUT_DIR);
    shell.rm('-rf', TARGET_BRANCH);
  }

  module.exports.runScript = runScript
  module.exports.cleanUp = cleanUp