# LLM Tagger 1.1.2 Release

## What's New in 1.1.2

This release adds support for custom Ollama server configurations, making the plugin more flexible for different network setups:

### New Features
- **Custom Ollama URL**: Configure the URL of your Ollama API server
- **Remote Ollama Support**: Connect to Ollama instances running on different machines
- **Dynamic Model Loading**: Models are automatically reloaded when changing the server URL
- **Improved Error Handling**: Better feedback when connection issues occur

## Use Cases

This update is particularly useful for:
- Users running Ollama on a different machine in their network
- Custom port configurations
- Docker or containerized Ollama setups
- Corporate environments with specific network requirements

## Installation

1. Download the `main.js`, `manifest.json`, and `styles.css` files
2. Place them in your vault's `.obsidian/plugins/obsidian-llm-tagger/` directory
3. Reload Obsidian and enable the plugin in Community Plugins settings

## Feedback

If you encounter any issues or have suggestions for improvements, please open an issue on GitHub.

Thank you for using LLM Tagger!
