# Obsidian LLM Tagger Plugin

This plugin uses Ollama to automatically tag your Obsidian notes using large language models running locally on your machine.

## Features

- 🤖 Uses local LLMs via Ollama for privacy and speed
- 🏷️ Automatically generates relevant tags for your notes
- 📝 Creates brief summaries with tags while preserving original content
- ⚡ Auto-tagging option for new and modified files
- 🎯 Customizable tag list for focused tagging
- 🔄 Smart processing that avoids re-tagging unchanged files

## Prerequisites

1. [Obsidian](https://obsidian.md/) v1.0.0 or higher
2. [Ollama](https://ollama.ai/) installed and running locally

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

## Configuration

- **Model Selection**: Choose any Ollama model you have installed
- **Default Tags**: Set your commonly used tags
- **Auto-tagging**: Toggle automatic tagging of new/modified files

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
