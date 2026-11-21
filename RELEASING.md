# Releasing

foldkit-scan is published to npm by `.github/workflows/release.yml`. It runs when a `v*` tag is pushed, and it can also be run by hand from the Actions tab as a dry run.

## Every release

1. In the PRs that change the package, run `pnpm changeset` and commit the file it writes.
2. When you want to release, run `pnpm version-packages` on a branch. It bumps `package.json`, writes `CHANGELOG.md` and removes the used changesets. Open a PR and merge it.
3. Tag the merge commit on main and push the tag:

   ```sh
   git switch main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow checks that the tag matches `package.json`, runs lint, typecheck, tests and build (with publint and attw), packs the tarball and publishes exactly that file.

To test the pipeline without publishing, open Actions → Release → Run workflow and leave "dry run" ticked. The packed tarball is kept as a run artifact, so you can download it and try it in an app with `pnpm add ./foldkit-scan-0.2.0.tgz`.

## One-time setup

npm only lets you add a trusted publisher to a package that already exists, so the first version goes out with a short-lived token.

1. Create an account on [npmjs.com](https://www.npmjs.com/signup) and turn on two-factor authentication.
2. In GitHub, go to Settings → Environments, create an environment called `npm`, and add the secret `NPM_TOKEN`. Create the token on npm under Access Tokens → Generate New Token → Granular Access Token, with read and write access to packages and the shortest expiry.
3. Push the tag for the first version, `v0.1.0`.
4. On npm, open the package's Settings → Trusted Publisher → GitHub Actions and enter:

   | Field                | Value              |
   | -------------------- | ------------------ |
   | Organization or user | `daniprol`         |
   | Repository           | `foldkit-scan`     |
   | Workflow filename    | `release.yml`      |
   | Environment name     | `npm`              |
   | Allowed actions      | tick `npm publish` |

5. Delete the `NPM_TOKEN` secret and revoke the token on npm. Then, under the package's Settings → Publishing access, choose "Require two-factor authentication and disallow tokens".

From then on, GitHub proves to npm which repository and workflow is publishing, and npm adds a provenance statement to each version.
