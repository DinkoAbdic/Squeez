# Contributing to Squeez

Thank you for your interest in contributing to Squeez! This guide will help you get started.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- Platform-specific build tools:
  - **Windows:** Visual Studio C++ Build Tools
  - **macOS:** `xcode-select --install`
  - **Linux:** See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/DinkoAbdic/Squeez.git
cd Squeez

# Install frontend dependencies
npm install

# Start the development server
npm run tauri dev
```

## 📝 How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/DinkoAbdic/Squeez/issues) to avoid duplicates.
2. Open a new issue using the **Bug Report** template.
3. Include steps to reproduce, expected vs. actual behavior, and your OS version.

### Suggesting Features

1. Open a new issue using the **Feature Request** template.
2. Describe the use case and proposed solution.

### Submitting Code

1. **Fork** the repository and create a feature branch from `main`.
2. Make your changes with clear, descriptive commits.
3. Ensure the app compiles and runs without errors:
   ```bash
   npm run tauri dev
   ```
4. Open a **Pull Request** against `main` with a clear description of the changes.

## 🏗 Project Structure

```
├── src/               # React frontend (TypeScript)
│   ├── App.tsx        # Main application component
│   ├── types.ts       # TypeScript type definitions
│   └── utils.ts       # Utility functions
├── src-tauri/         # Rust backend (Tauri)
│   └── src/
│       ├── commands.rs  # Tauri command handlers
│       ├── engine.rs    # Image processing engine
│       ├── types.rs     # Rust type definitions
│       ├── presets.rs   # Social media crop presets
│       └── lib.rs       # App setup and plugin registration
├── public/            # Static assets
└── design/            # Brand and design assets
```

## 🎨 Code Style

### Frontend (TypeScript/React)
- Use functional components with hooks.
- Keep components focused — one responsibility per file.
- Use `useCallback` for handlers passed as props.

### Backend (Rust)
- Follow standard Rust formatting (`cargo fmt`).
- Use `Result` types for error handling — avoid `unwrap()` in production code.
- Heavy processing should use `tokio::task::spawn_blocking` to keep the UI responsive.

## 📄 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
