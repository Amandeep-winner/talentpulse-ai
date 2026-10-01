# Contributing to TalentPulse AI

We welcome contributions adhering to the project engineering standards.

## Engineering Standards

- **TypeScript**: Strict mode enabled with no untyped any usage.
- **Validation**: All external inputs must be validated with Zod schemas.
- **Testing**: Every module must be accompanied by comprehensive tests.
- **Commits**: Follow the Conventional Commits specification (feat, fix, chore, docs, test, ci).
- **Line Structure**: When editing Markdown documents, keep each full sentence on its own physical line.
- **Punctuation**: Avoid em dashes and use standard dashes.

## Verification Gate

Before committing changes, ensure the entire verification pipeline passes:

```bash
npm run verify
```
