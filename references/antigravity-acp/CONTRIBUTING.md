# Contributing to Antigravity ACP Server

Thank you for your interest in contributing to the Antigravity ACP Server! We welcome contributions to improve this project.

---

## Development Setup

This project is built on [Bun](https://bun.sh) and uses TypeScript. Ensure you have Bun installed on your machine.

### 1. Clone the Repository
```bash
git clone https://github.com/google-antigravity/antigravity-acp.git
cd antigravity-acp
```

### 2. Install Dependencies
Run the following command to install dependencies. This will also automatically download the `agy` CLI binary for your platform into the `bin/` directory via a postinstall hook:
```bash
bun install
```

---

## Code Quality and Style

We use [Biome](https://biomejs.dev/) for linting, formatting, and import organization.

### Linting & Formatting
To check for linting and formatting issues:
```bash
bun run check
```

To automatically fix lints and format the codebase:
```bash
bun run format
```

### Type Checking
To run the TypeScript compiler and verify types:
```bash
bun run typecheck
```

---

## Running Tests

We use Bun's native test runner. Make sure all tests pass before submitting a pull request.

To run the test suite:
```bash
bun test
```

---

## Submitting a Pull Request

1. **Fork the Repository:** Create a fork of the repository on GitHub.
2. **Create a Branch:** Create a feature or bugfix branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit Changes:** Write clear, concise commit messages.
4. **Format & Verify:** Ensure that `bun run check`, `bun run typecheck`, and `bun test` all pass successfully.
5. **Open a PR:** Open a Pull Request against the `main` branch. Provide a detailed description of your changes and reference any related issues.
