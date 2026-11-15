# Publishing

Everything here has been prepared, nothing here has been published yet. Two destinations: GitHub
(source of truth, issues, CI) and npm (the `amh` command).

## 1. GitHub

The repository is already committed on `main` with `origin` set to
`https://github.com/nigedazhima/agent-memory-hub.git`. Only the remote has to exist.

**With the GitHub CLI:**

```bash
winget install --id GitHub.cli      # or: brew install gh
gh auth login
gh repo create agent-memory-hub --public --source . --push
```

**Without it:** create an empty repository named `agent-memory-hub` on github.com (no README, no
.gitignore, no license — this repo has all three), then:

```bash
git push -u origin main
```

The `ci` workflow runs on ubuntu-latest and windows-latest for Node 22 and 24: `npm ci`,
`npm run typecheck`, `npm test`, `npm run build`, `node bin/amh.mjs detect`, and
`node scripts/pack-smoke.mjs`.

## 2. npm

The package name `agent-memory-hub` is **free** on the public registry (checked: 404). The tarball is
41 kB packed / 118 kB unpacked / 39 files, and contains no sources, tests or `node_modules`.

Watch the registry: this machine's `npm config get registry` points at
`https://registry.npmmirror.com/`, which is a read-only mirror and **cannot accept publishes**. Publish
to the real one explicitly:

```bash
npm login --registry https://registry.npmjs.org
npm publish --registry https://registry.npmjs.org            # prepack runs tsc
npm publish --registry https://registry.npmjs.org --dry-run  # what was checked locally
```

`prepack` builds `dist/`, so a checkout without a local build still publishes correctly.

### Through GitHub Actions

`.github/workflows/publish.yml` is manual (`workflow_dispatch`) and defaults to a dry run. To use it:

1. Create an npm **automation** token with publish rights.
2. Add it as the repository secret `NPM_TOKEN`.
3. Run the workflow with `dry_run: false`.

Provenance (`--provenance`) is enabled, which needs the `id-token: write` permission the workflow
already requests.

## 3. Screenshots

`docs/screenshots/*.png` are generated from the fake store in `examples/demo`, never from a real one.
To regenerate, serve the demo store and shoot it:

```bash
# bash
AMH_HOME=$PWD/examples/demo amh web --port 7791
# PowerShell
$env:AMH_HOME="$PWD\examples\demo"; amh web --port 7791
```

Then screenshot `http://127.0.0.1:7791/` with `en-US` and `zh-CN` locales. The header path is folded to
`~/…` by the server, so no user name ends up in the image; keep it that way — if you shoot a real store,
your memory text is in the picture.

## 4. Versioning

`CHANGELOG.md` follows Keep a Changelog, versions follow SemVer. Release ceremony:

```bash
npm version patch|minor|major --no-git-tag-version
# edit CHANGELOG.md: move "Unreleased" into the new heading
git commit -am "chore(release): 0.3.1"
git tag -a v0.3.1 -m "0.3.1"
git push --follow-tags
```

## 5. Local environment notes (the machine this was built on)

Both of these fail in a confusing way, so they are written down here.

**The proxy is configured but not always running.** `git config --global http.proxy` and `HTTPS_PROXY` both
point at `socks5://127.0.0.1:10808`. When that proxy is down, `git` and PowerShell fail at connect time
("Failed to connect to github.com:443 over proxy 127.0.0.1") even though a direct connection to
`github.com:443` works. Override it for one command rather than rewriting the global config — the proxy may
be wanted again tomorrow:

```bash
git -c http.proxy= -c https.proxy= push -u origin main
```

**No GitHub credentials are stored.** `cmdkey /list` has only a Copilot app entry; there is no
`~/.git-credentials`, no `~/.config/gh/hosts.yml`, and no token in the environment. Git Credential Manager is
installed (`credential.helper=manager`) but needs an interactive console: a push started from a
non-interactive agent shell hangs on `git-credential-manager` with no browser window and no prompt. Run the
first push yourself in a normal terminal — GCM opens the browser once and stores the credential for later
pushes.

Telling detail: `%LOCALAPPDATA%\GitCredentialManager` does not exist, so no GCM flow has ever completed on
this machine. If you are debugging a similar hang, check that path first — a missing log directory means the
helper never got past its own startup, which points at "no console" rather than "wrong password".

