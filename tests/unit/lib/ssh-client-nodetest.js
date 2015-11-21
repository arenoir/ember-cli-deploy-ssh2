'use strict';

var Promise   = require('ember-cli/lib/ext/promise');
var assert    = require('ember-cli/tests/helpers/assert');
var chai      = require('chai')
var lodash    = require('lodash');
var sshClient = require('../../../lib/ssh-client');


describe('ssh-client', function() {
  var Redis;
  var options = {
    username: 'aaron',
    privateKeyPath: null,
    host: "mydomain.com",
    agent: null,
    port: 22
  }

  describe('#init', function() {

    it('sets options', function() {
      // var options = lodash.omit(options, 'username');
      var client = new sshClient(options)

      assert.equal(client.options, options);
    });

  })
});
