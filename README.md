# offline-dependencies

This tool allows a localDependencies specification in a package.json which
provides a list of packages, that will be downloaded in a local folder in
their packed tgz form (using npm pack) and can be checked in to a repository.

This local package will then be installed into the local source tree.

This is the Unwired-maintained fork of the original `offline-dependencies`
package, which is no longer maintained upstream (npm still serves 1.0.2 from
2021). The package name and the `local-dependencies` command are unchanged, so
switching to this fork only requires changing the dependency reference.

## installing

This fork is not published to npm — install it from GitHub, pinned to a tag:

```
npm i --save-optional git+https://github.com/unwired/offline-dependencies-ts.git#v1.0.3
```

which records in your package.json:

```
"optionalDependencies": {
  "offline-dependencies": "git+https://github.com/unwired/offline-dependencies-ts.git#v1.0.3"
}
```

Always pin to a tag rather than tracking `master`, so builds stay reproducible.

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

## releasing

Consumers pin to a git tag, so a new version is only consumable once it is
tagged. Bump the version in package.json, merge to master, then tag that
commit:

```
git tag v1.0.4
git push origin v1.0.4
```

Afterwards update the reference in the consuming repositories.
