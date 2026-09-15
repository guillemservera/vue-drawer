# Contributing

Thanks for helping improve VueDrawer.

## Development

Use Node.js 22 or 24 and pnpm 10.17.1:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Before opening a pull request, run the full local check:

```bash
pnpm run ci
```

The CI command runs type checking, tests, the production build, package linting and a dry package check.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update a regression test for behavior changes.
- Update the README when the public API or supported behavior changes.
- Document browser-specific behavior when it affects consumers.
- Do not commit generated `dist`, coverage or playground output files.
- Keep the public package contract compatible unless the change is intentional and documented.

Use the issue templates for reproducible bugs and feature proposals. For security reports, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
