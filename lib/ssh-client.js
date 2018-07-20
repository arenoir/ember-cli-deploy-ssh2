/* jshint node: true */
'use strict';

var CoreObject = require('core-object');
var Promise    = require('rsvp').Promise;
var SSH2Client = require('ssh2').Client;
var fs         = require('fs');
var untildify  = require('untildify');


module.exports = CoreObject.extend({

  init: function(options) {
    if (options.agent) {
      delete options["privateKeyPath"];
    }

    if (options.privateKeyPath) {
      options.privateKey = fs.readFileSync(untildify(options.privateKeyPath));
    }

    this.options = options;
    this.client  = new SSH2Client();
  },


  connect: function() {
    var client  = this.client;
    var options = this.options;

    client.connect(options);

    return new Promise(function(resolve, reject) {
      client.on('error', reject);
      client.on('ready', resolve);
    });
  },

  disconnect: function() {
    var client = this.client;

    client.end();

    return new Promise(function(resolve, reject) {
      client.on('error', reject);
      client.on('end', resolve);
    });
  },

  upload: function(path, data) {
    var client = this.client;

    return new Promise(function (resolve, reject) {
      client.sftp(function(error, sftp) {
        if (error) {
          reject(error);
        }

        var stream = sftp.createWriteStream(path);

        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.on('close', function() {
          sftp.end();
        });
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
        }

        sftp.readFile(path, {}, function (error, data) {
          sftp.end();

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
      client.exec(command, function(error/*, stream*/) {
        if (error) {
          reject(error);
        }
        resolve();
      });
    });
  },


  putFile: function(src, dest) {
    var _this  = this;
    var client = this.client;

    return new Promise(function(resolve, reject) {
      var parts = dest.split('/');
      parts.pop();
      var destdir = parts.join('/');
      var scpcmd  = 'mkdir -p ' + destdir;

      _this.exec(scpcmd).then(
        function() {
          client.sftp(function (err, sftp) {
            if (err) {
              reject(err);
            }

            sftp.fastPut(src, dest, {}, function (err) {
              sftp.end();

              if (err) {
                reject(err);
              }
              resolve();
            });
          });
        },
        reject
      );
    });
  }
});
