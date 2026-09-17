# VueDrawer release contract

## Merge is not a release

- A merged PR delivers source changes only. Do not describe a fix as available on npm or in consuming apps until publication and adoption are verified.
- When planning a package fix for a consumer, explicitly distinguish the upstream PR, npm release, and consumer dependency update. State which stages are authorized and which remain pending.
- A request to commit, open a PR, or merge does not by itself authorize publishing a release. If publication is outside the authorized scope, report that boundary explicitly.

## Publishing an authorized release

- Update `package.json` to the intended version and get that change reviewed and merged into `main` before tagging it. Follow the requested PR review and CI gates.
- Run `pnpm run ci`: typecheck, tests, build, publint, and package dry-run.
- Create the matching `vX.Y.Z` tag from the intended `main` commit and publish its GitHub Release. A merge or tag push alone does not trigger the release workflow.
- `.github/workflows/release.yml` runs on `release: published` and checks that the tag matches `package.json`.
- The workflow uses npm Trusted Publishing to stage the package with `npm stage publish`. A successful workflow is not proof that the version is publicly available: a maintainer must approve the staged release with 2FA.
- Verify the release workflow and public npm version before updating consumers. If approval is pending, report the exact remaining maintainer action; do not claim publication is complete.

## Consumer adoption

- Consumers such as Tickers Data's `ui-v2` import the published `@guillemservera/vue-drawer` package. Editing the separate `@tickersdata/vue-drawer` monorepo copy does not update that dependency.
- Once the release is public, update authorized consumers' dependency manifests and lockfiles and verify the affected behavior. Remove only workarounds made obsolete by the fix; preserve unrelated surface styling, clipping, and safe-area handling.
