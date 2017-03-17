/* jshint node: true */
'use strict';

var Promise          = require('rsvp').Promise;
var DeployPluginBase = require('ember-cli-deploy-plugin');
var path             = require('path');
var os               = require('os');
var username         = require('username');
var lodash           = require('lodash');
var sshClient        = require('./lib/ssh-client');

module.exports = {
  name: 'ember-cli-deploy-ssh2',

  createDeployPlugin: function(options) {
    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      _sshClient: sshClient,
      _client: null,
      defaultConfig: {
        distDir: function(context) {
          return context.distDir;
        },
        host: '',
        username: '',
        password: null,
        privateKeyPath: '~/.ssh/id_rsa',
        agent: null,
        port: 22,
        applicationFiles: ['index.html'],

        root: function(context) {
          return path.posix.join('/usr/local/www', context.project.name());
        },

        activationDestination: function(context, pluginHelper) {
          var root = pluginHelper.readConfig('root');

          return path.posix.join(root, 'active');
        },

        activationStrategy: 'symlink',

        uploadDestination: function(context, pluginHelper){
          var root = pluginHelper.readConfig('root');

          return path.posix.join(root, 'revisions');
        },

        revisionManifest: function(context, pluginHelper) {
          var root = pluginHelper.readConfig('root');

          return path.posix.join(root, 'revisions.json');
        },

        revisionKey: function(context) {
          return (context.commandOptions && context.commandOptions.revision) || (context.revisionData && context.revisionData.revisionKey);
        },

        revisionMeta: function(context, pluginHelper) {
          var revisionKey = pluginHelper.readConfig('revisionKey');
          var who = username.sync() + '@' + os.hostname();

          return {
            revision: revisionKey,
            deployer: who,
            timestamp: new Date().getTime(),
          };
        },
      },

      configure: function(context) {
        this._super.configure.call(this, context);

        var options = {
          host: this.readConfig('host'),
          username: this.readConfig('username'),
          password: this.readConfig('password'),
          port: this.readConfig('port'),
          privateKeyPath: this.readConfig('privateKeyPath'),
          passphrase: this.readConfig('passphrase'),
          agent: this.readConfig('agent')
        };

        this._client = new this._sshClient(options);
        return this._client.connect(this);
      },

      activate: function(/*context*/) {
        var _this = this;
        var client = this._client;
        var revisionKey = this.readConfig('revisionKey');
        var activationDestination = this.readConfig('activationDestination');
        var uploadDestination = path.posix.join(this.readConfig('uploadDestination'), '/');
        var activeRevisionPath =  path.posix.join(uploadDestination, revisionKey, '/');
        var activationStrategy = this.readConfig('activationStrategy');
        var revisionData = {
          revisionData: {
            activatedRevisionKey: revisionKey
          }
        };
        var linkCmd;

        this.log('Activating revision ' + revisionKey);

        if (activationStrategy === "copy") {
          linkCmd = 'cp -TR ' + activeRevisionPath + ' ' + activationDestination;
        } else {
          linkCmd = 'ln -fsn ' + activeRevisionPath + ' ' + activationDestination;
        }

        return client
          .exec(linkCmd)
          .then(function() {
            return _this
              ._activateRevisionManifest()
              .then(function() {
                return revisionData;
              });
          });
      },

      fetchRevisions: function(context) {
        this.log('Fetching Revisions');

        return this._fetchRevisionManifest().then(function(manifest) {
          context.revisions = manifest;
        });
      },

      upload: function(/*context*/) {
        var _this = this;

        return this._updateRevisionManifest().then(function() {
          _this.log('Successfully uploaded updated manifest.', {verbose: true});

          return _this._uploadApplicationFiles();
        });
      },

      teardown: function(/*context*/) {
        this.log('Teardown - closing sftp connection.', { verbose: true });

        return this._client.disconnect();
      },

      _uploadApplicationFiles: function(/*context*/) {
        var client = this._client;
        var files = this.readConfig('applicationFiles');
        var distDir = this.readConfig('distDir');
        var revisionKey = this.readConfig('revisionKey');
        var uploadDestination = this.readConfig('uploadDestination');
        var destination = path.posix.join(uploadDestination, revisionKey);
        var _this = this;

        this.log('Uploading `applicationFiles` to ' + destination);

        var promises = [];
        files.forEach(function(file) {
          var src = path.join(distDir, file);
          var dest = path.posix.join(destination, file);

          promises.push(client.putFile(src, dest));
        });

        return Promise.all(promises).then(
          function() {
            _this.log('Successfully uploaded file/s.', { color: 'green' });
          },
          function() {
            _this.log('Failed to upload file/s.', { color: 'red' });
          }
        );
      },

      _activateRevisionManifest: function(/*context*/) {
        var _this = this;
        var revisionKey = this.readConfig('revisionKey');
        var manifestPath = this.readConfig('revisionManifest');

        return this._fetchRevisionManifest().then(
          function(manifest) {
            manifest = lodash.map(manifest, function(rev) {
              if (rev.revision = revisionKey) {
                rev.active = true;
              } else {
                delete rev['active'];
              }

              return rev;
            });

            return _this._uploadRevisionManifest(manifestPath, manifest);
          },
          function(error) {
            _this.log(error.message, {color: 'red'});
          }
        );
      },

      _updateRevisionManifest: function() {
        var revisionKey  = this.readConfig('revisionKey');
        var revisionMeta = this.readConfig('revisionMeta');
        var manifestPath = this.readConfig('revisionManifest');
        var _this        = this;

        this.log('Updating `revisionManifest` ' + manifestPath, {verbose: true});

        return this._fetchRevisionManifest().then(
          function(manifest) {
            var existing = manifest.some(function(rev) {
              return rev.revision === revisionKey;
            });

            if (existing) {
              _this.log('Revision ' + revisionKey + ' already added to `revisionManifest` moving on.', {verbose: true});
              return;
            }

            _this.log('Adding ' + JSON.stringify(revisionMeta), {verbose: true});

            manifest.unshift(revisionMeta);

            return _this._uploadRevisionManifest(manifestPath, manifest);
          },
          function(error) {
            _this.log(error.message, {color: 'red'});
          }
        );
      },

      _fetchRevisionManifest: function() {
        var manifestPath = this.readConfig('revisionManifest');
        var client = this._client;
        var _this = this;

        return client.readFile(manifestPath).then(
          function(manifest) {
            _this.log('fetched manifest ' + manifestPath, {verbose: true});

            return lodash.isEmpty(manifest) ? [] : JSON.parse(manifest);
          },
          function(error) {
            if (error.message === "No such file") {
              _this.log('Revision manifest not present building new one.', {verbose: true});

              return [];
            } else {
              _this.log(error.message, {color: 'red'});
            }
          }
        );
      },

      _uploadRevisionManifest: function(manifestPath, manifest) {
        var data = new Buffer(JSON.stringify(manifest), "utf-8");

        return this._client.upload(manifestPath, data);
      }
    });

    return new DeployPlugin();
  }
};
