# Contributing to Miso

## Start the repository

Miso has two packages with their own dependencies: `client/` (Vue 3 with Vite) and `server/` (Express API on Neo4j). Install the Node.js version from `.nvmrc`, then set up the repository root once:

```bash
nvm install
npm ci            # commitlint for the commit-msg hook
npm run prepare   # activates .githooks; .npmrc disables install scripts, so npm does not run it for you
```

### With Docker Compose

`compose.yml` is for local development only. It starts Neo4j and builds its own images for the server and the client:

```bash
cp .env.example .env              # its values fit the compose services
(cd client && npm ci) && (cd server && npm ci)   # for your editor (types, ESLint); the containers install their own
docker compose up --build --watch
```

`--build` builds the images on the first start and rebuilds them after Dockerfile changes. `--watch` syncs changes in `client/` and `server/` into the running containers (Vite reloads, the server recompiles and restarts) and rebuilds an image when its `package.json` changes.

The editor runs on http://localhost:5173 and sends `/api` to the server (http://localhost:8080), Neo4j on http://localhost:7474 (user `neo4j`, password `neo4jadmin`). `./config` is mounted read-only into the server as `/app/config`; `GUIDELINES_URL` names a file there (default `guidelines.development.json`) or a URL.

### Without Docker

The compose setup is the supported way: the server reads its configuration directory from the fixed path `/app/config` and its settings only from the environment (no `.env` loading), and the client's Vite proxy sends `/api` to the compose service `backend`. Single services still run on their own, for example `docker compose up neo4j` for the database.

| Directory | Contents                                                              |
| --------- | --------------------------------------------------------------------- |
| `client/` | Vue application; its image serves the build with Caddy                |
| `server/` | Express API; its image runs on Node.js and writes logs to `/app/logs` |
| `config/` | Local guidelines for development (`guidelines.development.json`)      |

## Branches and commits

```
feature branch  ──►  dev  ──►  main
```

| Branch             | Purpose                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **feature branch** | Where you work. Branched from the latest `dev`, one per change, named after it (`feat/annotation-shortcut`, `fix/empty-result`).                                                                        |
| **`dev`**          | Integration branch. Pull requests are squash-merged into it.                                                                                                                                            |
| **`main`**         | Release branch. Maintainers promote `dev` with a merge commit, which releases. Urgent fixes may open a pull request into `main` directly; after every push to `main`, `main` is merged back into `dev`. |

You don't push to `dev` or `main` directly. Write [Conventional Commits](https://www.conventionalcommits.org), on your branch and in the pull request title:

```
type(scope): subject

feat(client): add a shortcut for new annotations
fix(server): handle an empty Neo4j result
docs: expand the local setup instructions
```

| Type                                    | Use for                                                   | In the changelog |
| --------------------------------------- | --------------------------------------------------------- | ---------------- |
| `feat`                                  | A new feature                                             | Yes              |
| `fix`, `perf`                           | A bug fix, a performance improvement                      | Yes              |
| `refactor`, `docs`, `revert`            | Restructuring, documentation, reverting an earlier change | Yes              |
| `build`, `ci`, `chore`, `style`, `test` | Build and Dockerfiles, CI, maintenance, formatting, tests | No               |

The scope is optional and one of `client`, `server`, `deps`, `release`; leave it out for repository-wide changes. Mark a breaking change with `!` after the type or scope: `feat(server)!: require authentication on all endpoints`.

The pull request title becomes the commit on `dev` and the line in the changelog, so make it say what changed. CI lints the title and the commits you push; the commit-msg hook checks them locally. If you are unsure about type or scope, open the pull request anyway and ask.

## Checks

Run these in the package you changed before you push:

| Command                                              | Checks                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run lint`                                       | ESLint                                                                 |
| `npm run format`                                     | Prettier (`npm run format:fix` repairs)                                |
| `npm test`                                           | Vitest unit tests (client)                                             |
| `npm run build` (client), `npm run compile` (server) | The package compiles; the client build includes the vue-tsc type check |

Every pull request into `dev` or `main` runs the full suite for both packages and both images, whatever you changed:

| Check                            | Fails on                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| PR title                         | A title that is not a Conventional Commit                                                     |
| Client / Server: lint and format | Lint errors, unformatted files                                                                |
| Client: unit tests               | A failing `npm test` (Vitest)                                                                 |
| Client / Server: package checks  | A failing `npm run build` (client, with the vue-tsc type check) or `npm run compile` (server) |
| Client / Server image            | A failing image build, AGPL licenses in the image                                             |
| Supply chain                     | Invalid npm registry signatures, copyleft production dependencies                             |
| Vulnerability and secret scan    | Committed secrets (gitleaks); dependency CVEs are reported, not blocking                      |
| SAST scan, CodeQL                | High-severity findings                                                                        |
| Config lint                      | Dockerfile findings (hadolint), misconfigurations (Trivy)                                     |
| Actions lint                     | Workflow findings (zizmor, actionlint)                                                        |

Never commit secrets or `.env` files: the secret scan blocks the pull request, and a leaked secret has to be rotated.

## Dependencies

Renovate opens dependency updates against `dev`, on branches named `deps/…`. Patch updates merge themselves once CI is green; minor and major updates arrive as pull requests. On `main` Renovate only proposes security fixes, as pull requests. The Node.js version in `.nvmrc` and in the Dockerfiles moves as one update. Do not open Dependabot security update PRs from the alerts page.

`.npmrc` in the root, `client/` and `server/` disables install scripts, blocks git and remote dependencies, and sets a three-day release cooldown: a version published less than three days ago cannot enter a lockfile.

Production dependencies must be permissively licensed: CI rejects copyleft licenses (GPL, LGPL, AGPL) in the npm dependencies, and AGPL anywhere in the image (the Alpine base brings GPL system packages, which is fine). Base images are pinned by tag and digest. Alpine packages are pinned by version (`apk add pkg=version`) and move together with the base image.

## Releases and deployments

Merging `dev` into `main` releases automatically: the workflow takes the version from the commits since the last release, updates `CHANGELOG.md`, tags `vX.Y.Z`, builds and publishes the client and server images, and deploys them to the production servers. While Miso is below `1.0.0`, a breaking change bumps the minor version and every other change the patch version; from `1.0.0` on, breaking changes bump the major and `feat` the minor version.

Every push to `dev` builds images tagged `dev` and `sha-<commit>` and deploys them for testing. A deployment waits until the containers are healthy and rolls back otherwise.

## Review checklist

- Explain the problem and the resulting behavior.
- Call out configuration, schema, API, dependency and deployment changes.
- Include screenshots when the client changes visibly.
- Keep unrelated refactors out of the change.
- Do not commit build output, generated reports or local configuration.

Contributions are licensed under the repository's [MIT License](LICENSE.md).
