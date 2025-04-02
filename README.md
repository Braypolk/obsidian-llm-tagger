# Obsidian LLM Tagger Plugin

This plugin uses Ollama to automatically tag your Obsidian notes using large language models running locally on your machine.

## Features

- 🤖 Uses local LLMs via Ollama for privacy and speed
- 🏷️ Automatically generates relevant tags for your notes
- 📝 Creates brief summaries with tags while preserving original content
- ⚡ Auto-tagging option for new and modified files
- 🎯 Customizable tag list for focused tagging
- 🔄 Smart processing that avoids re-tagging unchanged files
- 🚫 Exclude specific files or folders from tagging using patterns
- 📝 Skip auto-tagging for files you're currently editing
- 🔄 Auto-tag files when you close them
- 💾 Persistent tag storage between Obsidian sessions
- 🌐 Custom Ollama server URL support for remote or non-standard setups

## Prerequisites

1. [Obsidian](https://obsidian.md/) v1.0.0 or higher
2. [Ollama](https://ollama.ai/) installed and running locally or on an accessible server

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "LLM Tagger"
4. Click Install, then Enable

### Manual Installation

1. Download the latest release
2. Extract files to your vault's `.obsidian/plugins/obsidian-llm-tagger/` directory
3. Reload Obsidian
4. Enable the plugin in Community Plugins settings

## Usage

1. Click the robot icon in the left sidebar to open the tagger panel
2. Select your preferred Ollama model (e.g., llama2, mistral)
3. Enter your desired tags, separated by commas
4. Click "Start Tagging" to process your notes

### Auto-tagging

Enable auto-tagging in the plugin settings to automatically tag new or modified notes.

### Exclusion Patterns

You can exclude specific files or folders from being tagged by adding patterns in the plugin settings:
- Enter exact filenames (e.g., `daily.md`)
- Enter folder paths (e.g., `templates/`)
- Use wildcards (e.g., `*.excalidraw`, `meeting-notes/*`)

## Configuration

- **Ollama URL**: Set the URL of your Ollama API server (default: http://localhost:11434)
- **Model Selection**: Choose any Ollama model you have installed
- **Default Tags**: Set your commonly used tags
- **Auto-tagging**: Toggle automatic tagging of new/modified files
- **Exclude Patterns**: Specify files or folders to exclude from tagging

## Changelog

### v1.1.2 (April 2, 2025)
- Added custom Ollama server URL configuration
- Support for connecting to remote Ollama instances
- Dynamic model loading when changing the server URL
- Improved error handling for server connections

### v1.1.1 (April 1, 2025)
- Added "Untag all documents" button to remove tags from all files
- Added "Tag current document" and "Untag current document" buttons for single file operations
- Reorganized UI with separate sections for bulk operations and current document operations
- Added commands to tag and untag the current document

### v1.1 (March 21, 2025)
- Added exclusion patterns to skip specific files/folders from tagging
- Skip auto-tagging for files that are currently being edited
- Auto-tag files when they are closed (after editing)
- Persist tags between Obsidian sessions
- Improved user experience with automatic tag saving

### v1.0 (Initial Release)
- Basic tagging functionality with Ollama integration
- Auto-tagging for new and modified files
- Tag customization and model selection

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/obsidian-llm-tagger.git

# Install dependencies
npm install

# Build
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) for details
