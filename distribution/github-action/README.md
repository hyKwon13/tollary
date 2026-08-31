# Tollary Agent Payment Fit Check action

This directory is the publish-ready content for a dedicated public GitHub
Action repository. It intentionally pins `tollary@0.1.1`, runs the scan inside
the caller's runner, and exposes only a boolean, missing signal names, and a
safe next step. Source contents and evidence paths are not uploaded by Tollary
or copied to the GitHub job summary.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: tollary/agent-payment-fit-check@v1
    id: tollary
  - if: steps.tollary.outputs.fit == 'true'
    run: npx tollary@0.1.1 inspect
```

Publishing this Action requires a user-owned GitHub account or organization and
is deliberately excluded from automated deployment. Tag `v1` only after the
exact npm version is public and its packed contents have been reviewed.
