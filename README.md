# local-dependencies

This tool allows a localDependencies specification in a package.json which
provides a list of packages, that will be downloaded in a local folder in
their packed tgz form (using npm pack) and can be checked in to a repository.

This local package will then be installed into the local source tree.

## installing

```
npm i --save-dev offline-dependencies-js
```

## use cases

Typical use cases are:
- download a copy of private repositories/packages into the local source tree
  for docker/container builds or other build automation purposes where
  the credentials are not easily accessible to the build job, but to the
  developer.
- copy packages from 3rd party sources into the local source tree to allow
  installing those if the source becomes unavailble over time

## syntax

Show usage of the command (call without arguments to see usage):
 local-dependencies

package.json:
```
"localDependencies": {
  "localPath": "./npm-deps",
  "originalDependencies": {
    "wasabi-logger": "git+ssh://git@github.com:some-user/some-package.git#some-branch"
  }
}
```

package.json script target:
```
"scripts": {
  "update-local-deps": "local-dependencies install"
}
```

localPath must be specified, the folder will be created if it doesn't exist. This is where the
packages will be stored and can be checked in with your repo.

originalDependencies follows the same syntax as the regular dependencies property in
the package.json including semver versioned packages, local urls, and 3rd party URLs.

## usage

execute the script target:
```
npm run update-local-deps
```

## development

Install dependencies:

```
npm install
```

Run linting:

```
npm run lint
```

Run integration tests:

```
npm run test:integration
```
