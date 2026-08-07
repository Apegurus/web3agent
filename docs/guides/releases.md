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
Publishing for the public `web3agent` package before merging the workflow. Do
not merge release automation while either prerequisite below is missing.

1. Open the package settings on npm and add a GitHub Actions trusted publisher.
2. Set the owner to `Apegurus` and repository to `web3agent`.
3. Set the workflow filename to `ci.yml`.
4. Set the GitHub environment to `npm-publish`.
5. Allow the `npm publish` action.

An administrator must first create an `npm-publish` GitHub environment restricted
to the `develop` and `main` branches. Both branches must require pull requests and
the complete CI check, with administrator bypass, force pushes, and deletions
disabled. Configure the npm trusted publisher only after those repository controls
exist.

## Release flow

1. Bump the stable source version before the first merge for the next release and
   update every version surface enforced by `tests/config/distribution-config.test.ts`.
2. Merge feature and release-preparation PRs into `develop`.
3. Verify `web3agent@develop` resolves to the commit-addressed prerelease and its
   provenance identifies the merged commit.
4. Open and merge a `develop` to `main` release PR.
5. Verify `web3agent@latest` resolves to the exact committed version with matching
   integrity and provenance.
6. Create the matching Git tag and GitHub release from the published `main`
   commit.
7. Publish `server.json` through the MCP Registry publisher.
8. Run `pnpm run mcpb:check`, publish `dist/web3agent.mcpb` through Smithery, and
   verify that the bundle resolves the newly published npm version.

The source version must always be stable SemVer. The workflow derives npm and MCP
server prerelease metadata only in its isolated runner checkout and never commits
generated version changes. Direct branch pushes still run CI but are ineligible
for publication.
