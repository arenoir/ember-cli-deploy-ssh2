'use strict';

var fs     = require('node-fs');
var assert = require('ember-cli/tests/helpers/assert');
var CoreObject = require('core-object');

var mockSSHClient = CoreObject.extend({
  init: function(options) {
    this.options = options;
  },

  connect: function() {
    this._connected = true;
    return Promise.resolve();
  },

  _readFileError: null,

  readFile: function(path) {
    var readFileError = this._readFileError;
    var uploads = this._uploadedFiles;

    return new Promise(function(resolve, reject) {
      if (readFileError) {
        reject(readFileError);
      } else {
        var file = uploads[path];
        resolve(file);
      }
    });
  },

  _uploadedFiles: {},

  upload: function(path, data) {
    var files = this._uploadedFiles;

    return new Promise(function(resolve) {
      files[path] = data.toString();
      resolve();
    });
  },

  putFile: function(src, dest) {
    var files = this._uploadedFiles;

    var file = fs.readFileSync(src, "utf8");

    return new Promise(function(resolve) {
      files[dest] = file.toString();
      resolve();
    });
  },

  _command: '',
  exec: function(command) {
    var _this = this;
    return new Promise(function(resolve) {
      _this._command = command;
      resolve();
    });
  },
});


describe('the deploy plugin object', function() {
  var plugin;
  var configure;
  var context;

  before(function() {

  });

  beforeEach(function() {
    var subject = require('../../index');

    plugin = subject.createDeployPlugin({
      name: 'ssh2',
    });

    context = {
      ui: {write: function() {}, writeLine: function() {}},
      config: {
        'ssh2': {
          username: 'deployer',
          password: 'mypass',
          applicationFiles: ['index.html', 'manifest.appcache'],
          root: '/usr/local/www/my-app',
          distDir: 'tests/fixtures/dist',
          revisionMeta: function() {
            var revisionKey = this.readConfig('revisionKey');
          
            return {
              revision: revisionKey,
            };
          },
        }
      },
      revisionData: {
        revisionKey: '89b1d82820a24bfb075c5b43b36f454b'
      }
    };

    plugin._sshClient = mockSSHClient;

    plugin.beforeHook(context);
    configure = plugin.configure(context);
  });

  it('has a name', function() {
    assert.equal('ssh2', plugin.name);
  });

  it('implements the correct hooks', function() {
    assert.equal(typeof plugin.configure, 'function');
    assert.equal(typeof plugin.fetchRevisions, 'function');
  });

  describe('configure hook', function() {
    it('opens up a ssh connection.', function() {
      return assert.isFulfilled(configure)
        .then(function() {
          var client = plugin._client;

          assert.equal(client._connected, true); 
        });
    });

    it('instantiates a sshClient and assigns it to the `_client` property.', function() {
      return assert.isFulfilled(configure)
        .then(function() {
          var client = plugin._client;

          assert.equal(client.options.username, "deployer"); 
          assert.equal(client.options.password, "mypass");         
        });
    });
  });

  describe('fetchRevisions hook', function() {
    it('assigins context.revisions property.', function() {
      var revisions = [{"revision": "4564564545646"}];
      var client = plugin._client;
      var files = {};

      files["/usr/local/www/my-app/revisions.json"] = JSON.stringify(revisions);

      client._uploadedFiles = files;

      var fetching = plugin.fetchRevisions(context);

      return assert.isFulfilled(fetching).then(function() {
        assert.deepEqual(context.revisions, revisions); 
      });
    });

    it('assigins context.revisions proptery to empty array if revistion file not found.', function() {
      var client = plugin._client;
      
      client._readFileError = new Error('No such file');
      client._readFile = null;

      var fetching = plugin.fetchRevisions(context);

      return assert.isFulfilled(fetching).then(function() {
        assert.deepEqual(context.revisions, []); 
      });
    });
  });

  describe('activate hook', function() {
    it('creates a symbolic link to active version', function() {
      var activating = plugin.activate(context);
      var client = plugin._client;

      return assert.isFulfilled(activating).then(function() {
        assert.equal(client._command, 'ln -fs /usr/local/www/my-app/revisions/89b1d82820a24bfb075c5b43b36f454b/ /usr/local/www/my-app/active');
      });
    });

    it('copies revision to active', function() {
      context.config.ssh2.activationStrategy = "copy";
      plugin.configure(context);
      
      var activating = plugin.activate(context);
      var client = plugin._client;

      return assert.isFulfilled(activating).then(function() {
        assert.equal(client._command, 'cp -rf /usr/local/www/my-app/revisions/89b1d82820a24bfb075c5b43b36f454b/ /usr/local/www/my-app/active');
      });
    });

    it('returns revisionData', function() {
      var activating = plugin.activate(context);
      var expected = {
        revisionData: {
          activatedRevisionKey: '89b1d82820a24bfb075c5b43b36f454b'
        }
      };

      return assert.isFulfilled(activating).then(function(revisionData) {
        assert.deepEqual(expected, revisionData);
      });
    });

  });

  describe('upload hook', function() {
    it('updates revisionManifest', function() {
      var manifestPath = "/usr/local/www/my-app/revisions.json";
      var revisions = [{"revision": "4564564545646"}];
      var client = plugin._client;
      var files = {};
      files[manifestPath] = JSON.stringify(revisions);

      client._uploadedFiles = files;
      
      var uploading = plugin.upload(context);

      return assert.isFulfilled(uploading).then(function() {
        var manifest = client._uploadedFiles[manifestPath];
        revisions.unshift({'revision': '89b1d82820a24bfb075c5b43b36f454b'});
        assert.equal(JSON.stringify(revisions), manifest); 
      });
    });

    it('uploads applicationFiles', function() {
      // var client = plugin._client;
      // var uploading = plugin.upload(context);


      // return assert.isFulfilled(uploading).then(function() {
        
      //   var index = client._uploadedFiles['/usr/local/www/my-app/revisions/89b1d82820a24bfb075c5b43b36f454b/index.html']

      //   assert.equal(index, 'indexpage'); 
      // });
    });
  });

});