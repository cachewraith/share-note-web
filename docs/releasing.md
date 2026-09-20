# Releasing

One product, one version. The API, the viewer, the plugin and the contracts
package all release together as `X.Y.Z`, and that string is also the git tag and
the plugin's `manifest.json` version.

The tag has **no `v` prefix**. Obsidian requires the release tag to equal
`manifest.json`'s version exactly, and `manifest.json` cannot carry a `v`.

## One-time repository setup

The release workflow opens a pull request on your behalf, which GitHub blocks by
default. Enable it once:

**Settings → Actions → General → Workflow permissions**

- select _Read and write permissions_
- tick _Allow GitHub Actions to create and approve pull requests_

Or from the CLI:

```bash
gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

Without it, the `version` job fails with _"GitHub Actions is not permitted to
create or approve pull requests"_ — after having already pushed the
`changeset-release/main` branch, which you can open a PR from by hand.

Pushing images to GHCR needs nothing extra: the workflow's `packages: write`
permission covers it, and the first push creates the package.

## The loop

1. **You** add a changeset to the PR that changes something:

   ```bash
   pnpm changeset
   ```

   Pick every package your change affects and whether it is a patch, minor or
   major. The prompt's summary becomes the changelog entry, so write it for
   someone deciding whether to upgrade.

2. **CI** sees the changeset on `main` and opens a pull request titled
   _chore(release): version packages_. It accumulates every pending changeset;
   leave it open and it keeps updating.

3. **You** merge that PR when you want to release. Merging is the decision.

4. **CI** notices `main` is on a version with no tag, and then:
   - checks that all four `package.json` files, both `manifest.json` copies and
     `versions.json` agree on it;
   - creates and pushes the tag `X.Y.Z`;
   - builds the plugin and publishes a GitHub Release with `main.js`,
     `manifest.json` and `styles.css`;
   - builds and pushes `share-note-api`, `share-note-api-migrate` and
     `share-note-web` to GHCR for amd64 and arm64, tagged `X.Y.Z` and `latest`.

Nothing is published to npm. Every package is private; "release" means the tag,
the GitHub Release and the images.

## Why all four move together

A user installs a plugin and runs a server. If those can drift apart, the
support question becomes "which combination are you on?". Changesets is
configured with a `fixed` group, so bumping one bumps all four — even when only
the viewer changed.

The cost is version numbers that move without the code under them changing.
That is the cheaper half of the trade.

## What keeps the plugin manifest in step

`pnpm version-packages` runs Changesets and then `scripts/sync-plugin-manifest`,
which writes the new version into four files:

```
apps/plugin/manifest.json     what Obsidian loads
apps/plugin/versions.json     plugin version -> minimum Obsidian version
manifest.json                 root copy: the community-plugin submission reads it here
versions.json                 root copy, same reason
```

It refuses to run if the version is not semver, and CI re-checks all four before
tagging — so a hand-edited manifest fails the release rather than shipping.

If you raise `minAppVersion` in `apps/plugin/manifest.json`, do it in an
ordinary PR. The next release records that value against the new version in
`versions.json`, which is how Obsidian offers older clients the last plugin
version they can run.

## Migrations

Migrations are committed under `apps/api/prisma/migrations` and applied by the
`share-note-api-migrate` image, which runs to completion before the API starts.

**Every migration must be backward compatible for one release.** The old API
will still be serving while the new schema is live, during a rolling deploy and
during the window between `docker compose run --rm migrate` and
`docker compose up -d`. In practice:

- Adding a nullable column, a table or an index: fine.
- Dropping or renaming a column: two releases. Stop writing it in release _n_,
  drop it in _n+1_.
- Changing a type: add the new column, backfill, switch, drop later.

## When a release half-completes

A release publishes several things, and one of them can fail on its own. The
tag is created first and is never moved afterwards — a published tag has to keep
meaning the same commit — so recovery is to re-publish the artifacts for it:

**Actions → Release → Run workflow → tick _Re-publish artifacts_.**

That reruns the plugin and image jobs against the existing tag. It is safe to
run more than once: the images are content-addressed and the release assets are
replaced.

If the failure was in the workflow itself, push the fix to `main` first, then
dispatch. The jobs check out the _tag_, so a workflow fix on `main` takes effect
while the released code stays exactly what was tagged.

## Doing a release by hand

Only if CI is unavailable.

```bash
git switch -c release/version-packages
pnpm version-packages          # bumps versions, writes changelogs, syncs manifests
pnpm verify
git commit -am "chore(release): version packages"
# merge to main, then:
VERSION=$(node -p "require('./apps/plugin/package.json').version")
git tag "$VERSION" && git push origin "$VERSION"
pnpm --filter @share-note/plugin build
gh release create "$VERSION" --title "$VERSION" \
  --notes-file <(node scripts/release-notes.mjs "$VERSION") \
  apps/plugin/main.js apps/plugin/manifest.json apps/plugin/styles.css
```

## Submitting to the Obsidian community plugin list

Once, for the first release:

1. Have a tagged release whose assets include `main.js`, `manifest.json` and
   `styles.css`, and whose tag equals the manifest version.
2. Check the root `manifest.json` and `versions.json` are the ones the release
   wrote — the submission reads them from the repository root, not from
   `apps/plugin/`.
3. Open a PR against `obsidianmd/obsidian-releases` adding an entry to
   `community-plugins.json`.

After that, Obsidian picks up each new tagged release on its own.

## Checklist for a first release

- [ ] `pnpm verify` is green
- [ ] `pnpm --filter @share-note/api test:integration` is green against the stack
- [ ] `docker build -f apps/api/Dockerfile --target runtime .` succeeds
- [ ] `docker build -f apps/web/Dockerfile --target runtime .` succeeds
- [ ] A changeset exists describing the release
- [ ] `apps/plugin/manifest.json` has the right `minAppVersion` and
      `isDesktopOnly: false`
