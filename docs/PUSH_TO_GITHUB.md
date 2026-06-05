# Push to GitHub — publish runbook

The exact, repeatable sequence to publish NodeAgent as a public repo. The non-negotiable rule:
**no secrets, ever.** `.env.local` is gitignored and `scripts/secret-scan.mjs` is the
belt-and-suspenders that refuses to proceed if a secret or a tracked dotenv slips through.

## 0. Pre-flight (all must be green)

```bash
npm run secret-scan     # MUST print "SECRET-SCAN: clean" — gates everything
npm run typecheck       # tsc --noEmit, 0 errors
npm run test            # 31 passed
npm run build           # vite build, clean
```

`npm run prepush` runs secret-scan + typecheck + test in one shot.

## 1. Confirm secrets are ignored

```bash
# .env.local must NOT appear here (it is gitignored). .env.example SHOULD.
git status --porcelain | grep -i env        # expect only .env.example (or nothing staged yet)
git check-ignore .env.local                 # must echo ".env.local" (i.e. it IS ignored)
```

If `.env.local` is **not** ignored, stop and fix `.gitignore` before continuing.

## 2. Initialize and commit

```bash
git init -b main
git add -A
git status                                   # eyeball the tracked file list — no .env.local, no node_modules
npm run secret-scan                          # re-run against the staged tree
git commit -m "NodeAgent v1 — cross-collaborative agent: live context, grounded search, versioned spreadsheet, notebook"
```

## 3. Create the public repo and push

Using the GitHub CLI (recommended — creates the remote and pushes in one step):

```bash
gh repo create NodeAgent \
  --public \
  --source . \
  --remote origin \
  --description "Cross-collaborative agent: live chat context, grounded search & synthesis, versioned spreadsheet, TipTap notebook. Distilled from NodeBench AI." \
  --push
```

Or manually, if the remote already exists:

```bash
git remote add origin https://github.com/<you>/NodeAgent.git
git push -u origin main
```

## 4. Post-push verification (live-DOM discipline)

Don't trust the push exit code — confirm the public repo actually shows what you intended:

```bash
gh repo view <you>/NodeAgent --web       # opens it; confirm README renders, screenshots load
gh api repos/<you>/NodeAgent --jq '.visibility, .pushed_at'   # expect "public" + a fresh timestamp
```

Then, in the browser, confirm:

- [ ] README renders with the screenshots (`docs/screenshots/*.png` resolve).
- [ ] **No `.env.local`** in the file tree (search the repo for it — must be absent).
- [ ] `nodeagent-v1.html`, `src/`, `convex/`, `demo/`, `tests/`, `docs/` are all present.
- [ ] The Actions/commit list shows your single initial commit.

## 5. Optional polish

```bash
# Topics for discoverability
gh repo edit <you>/NodeAgent --add-topic agent,convex,tiptap,rag,context-engineering,typescript

# Pin a homepage if you deploy the prototype anywhere
gh repo edit <you>/NodeAgent --homepage "https://<your-deploy>/nodeagent-v1.html"
```

## If something looks wrong

- **A secret got committed.** Do not just delete it in a new commit — the history still has it.
  Rotate the key immediately, then scrub history (`git filter-repo`) or, for a brand-new repo with
  one commit, delete the repo and re-create it clean after fixing `.gitignore`.
- **Screenshots don't load on GitHub.** Confirm `docs/screenshots/*.png` were committed
  (`git ls-files docs/screenshots`) and the README paths are relative.
- **`gh` not authenticated.** `gh auth login` first.
