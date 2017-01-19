'use strict';

var assert = require('../../helpers/assert');
var Client = require('../../../lib/ssh-client');

describe('ssh-client', function() {
  var options = {
    username: 'aaron',
    privateKeyPath: null,
    host: "mydomain.com",
    agent: null,
    port: 22
  };

  describe('#init', function() {

    it('sets options', function() {
      // var options = lodash.omit(options, 'username');
      var client = new Client(options);

      assert.equal(client.options, options);
    });

  });
});
