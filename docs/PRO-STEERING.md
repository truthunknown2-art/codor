# ChatGPT Pro steering bridge

Codor's Board remains the orchestration source of truth. The bridge exports a
credential-free review packet and imports one versioned proposal atomically.

## Browser

Open **Board → Pro steering bridge**, copy the Board packet, and give it to Pro
with this instruction:

> Review this project against the repository and its product goals. Return only
> the edited `pro_steering_template` JSON object. Keep active, blocked,
> in-review, and completed tasks unchanged. Add or revise only future work.

Paste Pro's JSON into **Pro proposal**, select **Preview**, then **Apply
atomically**. A proposal made from an older Board version is rejected.

## Git/CLI

Export the live packet into the project repository:

```powershell
codor project export --channel truthforge --output docs/plans/CODOR-BOARD.json
```

After the returned `pro_steering_template` has been saved as
`docs/plans/PRO-STEERING.json`, apply it:

```powershell
codor project import docs/plans/PRO-STEERING.json --channel truthforge
```

The import never deletes Board history and never commits, pushes, or pulls Git.
