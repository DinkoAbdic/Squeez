# Changelog

All notable changes to Squeez will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Bulk image optimization with drag-and-drop support
- Format conversion: JPEG, PNG, WebP, AVIF
- Quality control with real-time size estimation
- Social media crop presets (Instagram, Facebook, LinkedIn, TikTok)
- Custom crop presets with localStorage persistence
- Interactive crop preview with pan and zoom
- Before/after compression comparison slider
- Cross-platform support (Windows, macOS, Linux)
- EXIF orientation auto-correction
- Custom window title bar
- Parallel batch processing via rayon (multi-core speedup)
- Virtualized image list for handling large batches (react-window)
- LRU preview cache (max 50 entries) for memory efficiency
- Output file collision protection (auto-appends `_1`, `_2`, etc.)
- Recursive directory scanning for nested folder imports
- Customizable filename pattern for exports with `{name}`, `{width}`, `{height}`, `{quality}`, `{format}` variables
- Filename pattern UI with clickable variable tags and live preview
- Content Security Policy (CSP) for production security
- `CONTRIBUTING.md` with setup guide and code style
- `CHANGELOG.md` following Keep a Changelog format
- `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
- `rust-toolchain.toml` for CI reproducibility

### Changed
- Decomposed monolithic `App.tsx` (1705 lines) into 9 focused components (~560 lines)
- Consolidated duplicate preview caching logic into `importAndCachePreviews` helper
- Preview no longer re-fetches unnecessarily on quality/format changes
- `apply_resize_owned` avoids unnecessary image cloning when no resize is needed

### Fixed
- "Clear All" now properly flushes preview cache and all comparison state
- Dropped images now eagerly cache previews (was missing unlike other import methods)
- Directory scanning is now truly recursive (previously only scanned one level)

### Removed
- Unused `jimp` dependency

[Unreleased]: https://github.com/DinkoAbdic/Squeez/commits/main
