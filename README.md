# ember-cli-deploy-ssh2 [![Build Status](https://travis-ci.org/arenoir/ember-cli-deploy-ssh2.svg?branch=master)](https://travis-ci.org/arenoir/ember-cli-deploy-ssh2)

> An ember-cli-deploy plugin to upload/activate/list versioned application file/s using ssh.

<hr/>
**WARNING: This plugin is only compatible with ember-cli-deploy versions >= 0.5.0**
<hr/>


This plugin uploads, activates and lists deployed revisions. It is different from other plugins as it works with multiple `applicationFiles`. The primary use case is being able to keep the `index.html` and `manifest.appcache` files versioned and activated together. 


## Quick Start
To get up and running quickly, do the following:

- Ensure [ember-cli-deploy-build][1], [ember-cli-deploy-revision-data][3] and [ember-cli-deploy-display-revisions][4]) are installed and configured.

- Install this plugin

```bash
$ ember install ember-cli-deploy-ssh2
```

- Place the following configuration into `config/deploy.js`

```javascript
ENV['ssh2'] = {
  host: 'webserver1.example.com',
  username: 'production-deployer',
  privateKeyPath: '~/.ssh/id_rsa',
  port: 22,
  applicationFiles: ['index.html', 'manifest.appcache'],
  root: '/usr/local/www/my-application'
}
```

- Run the pipeline

```bash
$ ember deploy
```

## Configuration Options

### host
  The host name or ip address of the machine to connet to.

*Default:* `''`

### username

  The username to use to open a ssh connection.

*Default:* `''`

### privateKeyPath

  The path to a private key to authenticate the ssh connection.

*Default:*  ```'~/.ssh/id_rsa'```
  
### port
  The port to connect on. 

*Default:* ```'22'```

### applicationFiles
  A list of files to upload to the server. 

*Default:* ```['index.html']```

### root

  A function or string used to determine where to upload `applicationFiles`.

*Default:* ```'/usr/local/www/' + context.project.name()```

### uploadDestination

  A string or a function returning the path where the application files are stored.

*Default:* 
```
function(context){
  return path.join(this.readConfig('root'), 'revisions');
}
```

### activationDestination

  The path that the active version should be linked to. 

*Default:* 
```
function(context) {
  return path.join(this.readConfig('root'), 'active');
}
```

### revisionManifest
  
  A string or a function returning the path where the revision manifest is located.

*Default:* 
```
function(context) {
  return path.join(this.readConfig('root'), 'revisions.json');
}
```

### revisionMeta
  A function returning a hash of meta data to include with the revision.

*Default:* 
```
function(context) {
  var revisionKey = this.readConfig('revisionKey');
  var who = username.sync() + '@' + os.hostname();
          
  return {
    revision: revisionKey,
    deployer: who,
    timestamp: new Date().getTime(),
  }
}
```


## Prerequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`                     (provided by [ember-cli-deploy-build][2])
- `revisionData`                (provided by [ember-cli-deploy-revision-data][3])

The following commands require:

- `deploy:list`                 (provided by [ember-cli-deploy-display-revisions][4])



[1]: http://ember-cli.github.io/ember-cli-deploy/plugins "Plugin Documentation"
[2]: https://github.com/ember-cli-deploy/ember-cli-deploy-build "ember-cli-deploy-build"
[3]: https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data "ember-cli-deploy-revision-data"
[4]: https://github.com/ember-cli-deploy/ember-cli-deploy-display-revisions "ember-cli-deploy-display-revisions"
