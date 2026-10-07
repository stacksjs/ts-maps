# GitHub Actions

This folder contains the following GitHub Actions:

- [CI][CI] - all CI jobs for the project
  - lints the code
  - `typecheck`s the code
  - runs test suite
  - runs on `ubuntu-latest`
- [Release][Release] - automates the release process & changelog generation
- [Deploy][Deploy] - ships the docs and playground to ts-maps.stacksjs.com on push to `main`
  - attaches to the shared Stacks Hetzner box through ts-cloud
  - needs the `HCLOUD_TOKEN`, `CLOUDFLARE_API_TOKEN` and `DEPLOY_SSH_KEY` secrets, and skips until they are set

[CI]: ./workflows/ci.yml
[Release]: ./workflows/release.yml
[Deploy]: ./workflows/deploy.yml
