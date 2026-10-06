# Contributing

Wheelman is a working tool for one dealer, published so it can be read and referred to. Changes
are welcome as pull requests. The rules below are what keep it safe to publish.

## The four rules

1. **No dependencies.** Nothing from npm, no build step. Node.js built-ins only (`node:sqlite`,
   `node:test`, `node:http`, …), plain ES modules, plain CSS and HTML. CI refuses a `package.json`
   with dependencies.
2. **Invented data only.** Tests, fixtures and documentation use made-up names, numbers,
   emails and addresses. Phone numbers come from the 0491 570 1xx range, which is reserved for
   fiction. Never paste anything from a real conversation, a real record or a real screen.
3. **Nothing private leaves the computer.** Run `npm run check-private` before every push, and
   enable the hook so it runs by itself: `git config core.hooksPath .githooks`. The real business
   facts, staff names, `.env` and the database are git-ignored; keep them that way.
4. **The product rules are fixed.** Wheelman never sends; every outside system is read-only
   through an allowlist; customer details never reach an AI; every figure and link is verified or
   left as a blank; Marketplace and the phone never teach; Dismiss is always recoverable. A change
   that weakens one of these will not be merged.

## Working on it

```bat
npm test                 :: every check, about ten seconds, no internet
npm run check-private    :: before every push
```

- One branch and one pull request per change. Keep the app working end to end at every commit.
- Commit titles read `Area: what changed, in plain words`, for example
  `Auction: a message is always written, with blanks for what cannot be looked up`.
- Write for the owner, who is not a developer: plain words in the page, in the README and in
  commit messages.
- A change to behaviour comes with a test on invented data, and with the README and
  `CHANGELOG.md` ("Unreleased") updated in the same pull request.
- No AI is ever credited as an author or co-author in a commit, pull request or file.

## Releases

Versions follow `MAJOR.MINOR.PATCH`. To cut one: move the "Unreleased" entries in `CHANGELOG.md`
under the new version with the date, run `npm version <version> -m "Release: %s"`, then
`git push --follow-tags`. The release workflow runs the tests and publishes a GitHub release
with that version's notes from the changelog.
