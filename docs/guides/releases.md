# Release channels

Web3Agent publishes the root `web3agent` package after the complete CI matrix
succeeds on protected branch pushes.

| Branch | npm version | npm dist-tag |
|---|---|---|
| `develop` | `<package.json version>-develop.sha<full commit SHA>` | `develop` |
| `main` | Exact committed `package.json` version | `latest` |

Every published tarball is built from the triggering commit after lint,
typecheck, build, tests, packaging smoke, and the production audit pass. A
superseded branch run does not publish, and rerunning an already-published commit
is an idempotent no-op.

## One-time trusted publishing setup

The workflow intentionally has no npm token fallback. Configure npm Trusted
Publishing for the public `web3agent` package before merging the workflow:

1. Open the package settings on npm and add a GitHub Actions trusted publisher.
2. Set the owner to `Apegurus` and repository to `web3agent`.
3. Set the workflow filename to `ci.yml`.
4. Set the GitHub environment to `npm-publish`.
5. Allow the `npm publish` action.

The GitHub repository must also have an `npm-publish` environment restricted to
the `develop` and `main` branches. Both branches should require pull requests and
the complete CI check, with force pushes and deletions disabled.

## Release flow

1. Merge feature and release-preparation PRs into `develop`.
2. Verify `web3agent@develop` resolves to the commit-addressed prerelease.
3. Open and merge a `develop` to `main` release PR.
4. Verify `web3agent@latest` resolves to the exact committed version.
5. Create the matching Git tag and GitHub release from the published `main`
   commit.

The source version must always be stable SemVer. The workflow derives prerelease
versions only in its isolated runner checkout and never commits generated version
changes.
