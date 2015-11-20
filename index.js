/* jshint node: true */
'use strict';

var Promise          = require('ember-cli/lib/ext/promise');
var DeployPluginBase = require('ember-cli-deploy-plugin');
var sshClient        = require('ssh2').Client;
var path             = require('path');
var fs               = require('fs');
var os               = require('os');
var username         = require('username');
var lodash           = require('lodash');

function upload(client, path, data) {
  return new Promise(function (resolve, reject){
    client.sftp(function(error, sftp) {
      if (error) {
        reject(error);
      };
      
      var stream = sftp.createWriteStream(path);
      
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.write(data);
      stream.end();
    });
  });
};

function readFile(client, path) {
  var buffer = fs.createWriteStream('tmp/readFile');

  return new Promise(function(resolve, reject) {
    client.sftp(function(error, sftp) {
      if (error) {
        reject(error);
      };

      sftp.readFile(path, {}, function (error, data) {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  });
};

function uploadFile(client, scr, dest) {
  return new Promise(function(resolve, reject) {
    client.sftp(function(error, sftp) {
      if (error) {
        reject(error);
      };

      sftp.fastPut(src, dest, {}, function (err) {
        if (err) {
          reject(err);
        };          
        resolve();
      });
    });
  });
}

function clientExec(client, command) {
  return new Promise(function(resolve, reject) {
    client.exec(command, function(err, stream) {
      if (err) {
        reject(err);
      };
      resolve();
    });
  });
}


function putFile(client, src, dest) {
  return new Promise(function(resolve, reject) {
    var parts = dest.split('/');
    var filename = parts.pop();
    var destdir = parts.join('/');
    var scpcmd  = 'mkdir -p ' + destdir;

    clientExec(client, scpcmd).then(
      function() {
        client.sftp(function (err, sftp) {
          if (err) {
            reject(err);
          }
           
          sftp.fastPut(src, dest, {}, function (err) {
            if (err) {
              reject(err);
            };
            resolve();
          });
        })
      },
      reject
    );
  });
}


module.exports = {
  name: 'ember-cli-deploy-ssh2',

  createDeployPlugin: function(options) {
    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      __client: null,
      defaultConfig: {
        distDir: function(context) {
          return context.distDir;
        },
        host: '',
        username: '',
        privateKeyPath: '~/.ssh/id_rsa',
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
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        },

        revisionMeta: function(context) {
          var revisionKey = this.readConfig('revisionKey');
          var who = username.sync() + '@' + os.hostname();
          
          return {
            revision: revisionKey,
            deployer: who,
            timestamp: new Date().getTime(),
          }
        }
      },

      configure: function(context) {
        this._super.configure.call(this, context);
        //Object.keys(this.defaultConfig).forEach(this.applyDefaultConfigProperty.bind(this));
        
        var client = new sshClient();
        var privateKeyPath = this.readConfig('privateKeyPath');
        var privateKey;

        if (privateKeyPath) {
          privateKey = fs.readFileSync(privateKeyPath);
        }
        var options = {
          host: this.readConfig('host'),
          username: this.readConfig('username'),
          port: this.readConfig('port'),
          privateKey: privateKey
        }

        client.connect(options);

        this.__client = client;
        //return client;
        return new Promise(function(resolve, reject) {
          client.on('ready', resolve);
        });
      },

      activate: function(context) {
        this.log(this.readConfig('revisionKey'));
        var _this = this;
        var client = this.__client;
        var redisDeployClient = this.readConfig('redisDeployClient');
        var revisionKey = this.readConfig('revisionKey');
        var activationDestination = this.readConfig('activationDestination');
        var uploadDestination = path.join(this.readConfig('uploadDestination'), '/');
        var activeRevisionPath =  path.join(uploadDestination, revisionKey, '/');

        this.log('Activating revision ' + revisionKey);

        
        var linkCmd = 'ln -fs ' + activeRevisionPath + ' ' + activationDestination;
        
        return new Promise(function(resolve, reject) {
          clientExec(client, linkCmd, _this).then(
            function() {
              _this.log('clientExeced');
              _this.log('activate now');
              _this._activateRevisionManifest().then(resolve, reject);
            },
            reject
          );
        });
      },

      _client: function() {
        return this.__client;
      },

      _configureClient: function() {
        var client = new sshClient();
        var privateKeyPath = this.readConfig('privateKeyPath');
        var privateKey;

        if (privateKeyPath) {
          privateKey = fs.readFileSync(privateKeyPath);
        }
        var options = {
          host: this.readConfig('host'),
          username: this.readConfig('username'),
          port: this.readConfig('port'),
          privateKey: privateKey
        }

        client.connect(options);

        this.__client = client;

        //return client;
        return new Promise(function(resolve, reject) {
          client.on('ready', resolve);
        });
        
      },

      fetchRevisions: function(context) {
        return this._fetchRevisionManifest().then(
          function(manifest) {
            context.revisions = manifest;
          },
          function(error) {
            this.log(error, {color: 'red'});
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
            this.log(error, {color: "red"})
          }
        );
      },

      teardown: function(context) {
        this.log('teardown');
        this.__client && this.__client.end();
      },

      _uploadFiles: function(context) {
        var client = this._client();
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

            promises.push(putFile(client, src, dest, _this));
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
        var client = this._client();
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

              _this.log(JSON.stringify(manifest));

              var data = new Buffer(JSON.stringify(manifest), "utf-8");

              upload(client, manifestPath, data, _this).then(resolve, reject);         
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
        var fetching = this._fetchRevisionManifest();
        var client   = this._client();
        var _this = this;


        this.log(JSON.stringify(revisionMeta));

        return new Promise(function(resolve, reject) {
          fetching.then(
            function(manifest) {
              manifest = lodash.reject(manifest, {'revision':  revisionKey});
              manifest.unshift(revisionMeta);

              var data = new Buffer(JSON.stringify(manifest), "utf-8");

              upload(client, manifestPath, data, _this).then(resolve, reject);         
            },
            function(error) {
              _this.log(error, {color: 'red'});
              reject(error);
            }
          );
        });
      },

      _fetchRevisionManifest: function() {
        var manifestPath = this.readConfig('revisionManifest');
        var client = this._client();
        var _this = this;
        return new Promise(function(resolve, reject) {
          readFile(client, manifestPath, _this).then(
            function(manifest) {
              resolve(JSON.parse(manifest));
            },
            function(error) {
              //_this.log('no such file?', {color: 'red'});
              //_this.log(error, {color: 'red'});
              return resolve([]);
            }
          );
        });
      },

    });

    return new DeployPlugin();
  }
};