/* jshint node: true */
'use strict';

var Promise          = require('ember-cli/lib/ext/promise');
var DeployPluginBase = require('ember-cli-deploy-plugin');
var path             = require('path');
var fs               = require('fs');
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
        privateKeyPath: null,
        agent: null,
        port: 22,
        applicationFiles: ['index.html'],
        
        root: function(context) {
          return path.join('/usr/local/www', context.project.name());
        },

        activationDestination: function(context) {
          var root = this.readConfig('root');

          return path.join(root, 'active');
        },
        
        uploadDestination: function(context){
          var root = this.readConfig('root');

          return path.join(root, 'revisions');
        },

        revisionManifest: function(context) {
          var root = this.readConfig('root');

          return path.join(root, 'revisions.json');
        },

        revisionKey: function(context) {
          return (context.commandOptions && context.commandOptions.revision) || (context.revisionData && context.revisionData.revisionKey);
        },

        revisionMeta: function(context) {
          var revisionKey = this.readConfig('revisionKey');
          var who = username.sync() + '@' + os.hostname();
          
          return {
            revision: revisionKey,
            deployer: who,
            timestamp: new Date().getTime(),
          }
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
          agent: this.readConfig('agent')
        }

        this._client = new this._sshClient(options)
        return this._client.connect(this);
      },

      activate: function(context) {
        var _this = this;
        var client = this._client;
        var redisDeployClient = this.readConfig('redisDeployClient');
        var revisionKey = this.readConfig('revisionKey');
        var activationDestination = this.readConfig('activationDestination');
        var uploadDestination = path.join(this.readConfig('uploadDestination'), '/');
        var activeRevisionPath =  path.join(uploadDestination, revisionKey, '/');

        this.log('Activating revision ' + revisionKey);

        var linkCmd = 'ln -fs ' + activeRevisionPath + ' ' + activationDestination;
        
        return new Promise(function(resolve, reject) {
          client.exec(linkCmd, _this).then(
            function() {
              _this.log('clientExeced');
              _this.log('activate now');
              _this._activateRevisionManifest().then(resolve, reject);
            },
            reject
          );
        });
      },


      fetchRevisions: function(context) {
        var _this = this;
        this.log('Fetching Revisions');

        return this._fetchRevisionManifest().then(
          function(manifest) {
            context.revisions = manifest;
          },
          function(error) {
            _this.log(error, {color: 'red'});
          }
        );
      },

      upload: function(context) {
        var _this = this;

        return this._updateRevisionManifest().then(
          function() {
            return _this._uploadFiles();
          },
          function(error) {
            _this.log(error, {color: "red"})
          }
        );
      },

      teardown: function(context) {
        return this._client.disconnect();
      },

      _uploadFiles: function(context) {
        var client = this._client;
        var files = this.readConfig('applicationFiles');
        var distDir = this.readConfig('distDir');
        var revisionKey = this.readConfig('revisionKey');
        var uploadDestination = this.readConfig('uploadDestination');
        var destination = path.join(uploadDestination, revisionKey);
        var _this = this;
        
        this.log('Uploading `applicationFiles` to ' + destination);

        var uploading = new Promise(function(resolve, reject) {
          var promises = [];
          files.forEach(function(file) {
            var src = path.join(distDir, file);
            var dest = path.join(destination, file);

            promises.push(client.putFile(src, dest, _this));
          });

          Promise.all(promises).then(resolve, reject);
        });

        uploading.then(
          function() {
            _this.log('Successfully uploaded file/s.', { color: 'green' });
          },
          function() {
            _this.log('Faild to upload file/s.', { color: 'red' });
          }
        );

        return uploading;
      },

      _activateRevisionManifest: function(context) {
        var _this = this;
        var client = this._client;
        var revisionKey = this.readConfig('revisionKey');
        var fetching = this._fetchRevisionManifest();
        var manifestPath = this.readConfig('revisionManifest');

        return new Promise(function(resolve, reject) {
          fetching.then(
            function(manifest) {
              manifest = lodash.map(manifest, function(rev) {
                if (rev.revision = revisionKey) {
                  rev.active = true;
                } else {
                  delete rev['active'];
                }
                return rev;
              });

              var data = new Buffer(JSON.stringify(manifest), "utf-8");

              client.upload(manifestPath, data, _this).then(resolve, reject);         
            },
            function(error) {
              _this.log(error, {color: 'red'});
              reject(error);
            }
          );
        });
      },

      _updateRevisionManifest: function() {
        var revisionKey = this.readConfig('revisionKey');
        var revisionMeta = this.readConfig('revisionMeta');
        var manifestPath = this.readConfig('revisionManifest');
        var client = this._client;
        var _this = this;

        this.log(JSON.stringify(revisionMeta));

        return new Promise(function(resolve, reject) {
          _this._fetchRevisionManifest().then(
            function(manifest) {
              manifest.forEach(function(rev) {
                if (rev.revision === revisionKey) {
                  resolve();
                  return;
                }
              });

              manifest.unshift(revisionMeta);

              var data = new Buffer(JSON.stringify(manifest), "utf-8");

              client.upload(manifestPath, data).then(resolve, reject);         
            },
            function(error) {
              _this.log(error.message, {color: 'red'});
              reject(error);
            }
          );
        });
      },

      _fetchRevisionManifest: function() {
        var manifestPath = this.readConfig('revisionManifest');
        var client = this._client;
        var _this = this;

        return new Promise(function(resolve, reject) {
          client.readFile(manifestPath).then(
            function(manifest) {
              resolve(JSON.parse(manifest));
            },
            function(error) {
              if (error.message === "No such file") {
                resolve([]);
              } else {
                _this.log(error.message, {color: 'red'});
                reject(error);
              }
            }
          );
        });
      }
    });

    return new DeployPlugin();
  }
};