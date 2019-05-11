# Change Log

## [0.0.7] - 2019-05-11
- [Pull Request #16](https://github.com/arenoir/ember-cli-deploy-ssh2/pull/16) Close sftp channels/connections

## [0.0.6] - 2017-04-21
- [Pull Request #14](https://github.com/arenoir/ember-cli-deploy-ssh2/pull/14) Fix ember-cli/ext/promise Deprecation for Ember CLI >=2.12.0

## [0.0.5] - 2017-03-01
- [Pull Request #13](https://github.com/arenoir/ember-cli-deploy-ssh2/pull/13) Make sure _fetchRevisionManifest works if the manifest is empty
- [Pull Request #12](https://github.com/arenoir/ember-cli-deploy-ssh2/pull/12) update ember cli

## [0.0.4] - 2016-07-14
- change copy strategy flags.

## [0.0.3] - 2016-05-02
- Add activationStrategy to config options. Because nginx on alpine linux wasn't following a symlink from a alias directive.

## [0.0.2] - 2016-04-26
- Update ssh2 module thus dropping support for node v0.8
- [Issue #5](https://github.com/arenoir/ember-cli-deploy-ssh2/issues/5) Add passphrase to config options.

## [0.0.1] - 2015-11-24
- Return revisionData object from activate hook. Useful for notification plugins.

## [0.0.0] - 2015-11-21
- Initial release
