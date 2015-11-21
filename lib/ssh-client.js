/* jshint node: true */
'use strict';

var CoreObject = require('core-object');
var Promise    = require('ember-cli/lib/ext/promise');
var ssh2Client = require('ssh2').Client;
var path       = require('path');
var fs         = require('fs');
var os         = require('os');
var untildify  = require('untildify');


module.exports = CoreObject.extend({

  init: function(options) {
    var privateKey;

    if (options.agent) {
      delete options["privateKeyPath"]
    }

    if (options.privateKeyPath) {
      options.privateKey = fs.readFileSync(untildify(options.privateKeyPath));
    }

    this.options = options;
    this.client  = new ssh2Client();  
  },


  connect: function() {
    var client  = this.client;
    var options = this.options;

    client.connect(options);

    return new Promise(function(resolve, reject) {
      client.on('ready', resolve);
    });
  },

  disconnect: function() {
    var client = this.client;

    client.end();

    return new Promise(function(resolve, reject) {
      client.on('end', resolve);
    });
  },

  upload: function(path, data) {
    var client = this.client;

    return new Promise(function (resolve, reject) {
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
  },


  readFile: function(path) {
    var client = this.client;

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
  },


  exec: function(command) {
    var client = this.client;
    return new Promise(function(resolve, reject) {
      client.exec(command, function(err, stream) {
        if (err) {
          reject(err);
        };
        resolve();
      });
    });
  },


  putFile: function(src, dest) {
    var _this  = this;
    var client = this.client;

    return new Promise(function(resolve, reject) {
      var parts = dest.split('/');
      var filename = parts.pop();
      var destdir = parts.join('/');
      var scpcmd  = 'mkdir -p ' + destdir;

      _this.exec(scpcmd).then(
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
});