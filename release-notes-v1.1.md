# LLM Tagger v1.1 Release

## What's New in v1.1

This release adds several quality-of-life improvements to the LLM Tagger plugin:

### Exclusion Patterns
- Added support for excluding specific files and folders from tagging
- Supports exact filename matching, folder path matching, and wildcard patterns
- Configure exclusions in the plugin settings

### Improved Auto-Tagging
- Skip auto-tagging for files that are currently being edited
- Auto-tag files when they are closed (after editing)
- More intelligent processing to avoid interrupting your workflow

### Persistent Tag Storage
- Tags are now saved between Obsidian sessions
- Pre-populated tag input for a smoother experience
- Automatic saving of tags when input field loses focus

## Installation

1. Download the `main.js` and `manifest.json` files
2. Place them in your vault's `.obsidian/plugins/obsidian-llm-tagger/` directory
3. Reload Obsidian and enable the plugin in Community Plugins settings

## Feedback

If you encounter any issues or have suggestions for improvements, please open an issue on GitHub.

Thank you for using LLM Tagger!
