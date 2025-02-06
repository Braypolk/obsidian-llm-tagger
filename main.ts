import { 
    App, 
    Plugin, 
    Modal, 
    Notice, 
    TFile, 
    PluginSettingTab, 
    Setting,
    WorkspaceLeaf,
    ItemView,
    addIcon,
    debounce
} from 'obsidian';


const ICON_NAME = 'llm-tagger-robot';
const VIEW_TYPE = 'llm-tagger-view';

interface LLMTaggerSettings {
    selectedModel: string | null;
    defaultTags: string[];
    autoAddTags: boolean;
    taggedFiles: { [path: string]: number }; // Map of file paths to timestamp of last tagging
}

const DEFAULT_SETTINGS: LLMTaggerSettings = {
    selectedModel: null,
    defaultTags: [],
    autoAddTags: false,
    taggedFiles: {}
}

export default class LLMTaggerPlugin extends Plugin {
    settings: LLMTaggerSettings;
    view: LLMTaggerView;
    private autoTaggingEnabled = false;

    async onload() {
        console.log('Loading LLM Tagger plugin');
        await this.loadSettings();

        // Add robot icon
        addIcon(ICON_NAME, `<svg width="100" height="100" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C11.1 2 10.5 2.6 10.5 3.5V4H9C7.9 4 7 4.9 7 6V7H6.5C5.7 7 5 7.7 5 8.5V11.5C5 12.3 5.7 13 6.5 13H7V14C7 15.1 7.9 16 9 16H10V16.5C10 17.3 10.7 18 11.5 18H12.5C13.3 18 14 17.3 14 16.5V16H15C16.1 16 17 15.1 17 14V13H17.5C18.3 13 19 12.3 19 11.5V8.5C19 7.7 18.3 7 17.5 7H17V6C17 4.9 16.1 4 15 4H13.5V3.5C13.5 2.6 12.9 2 12 2Z" fill="currentColor"/>
            <circle cx="9.5" cy="9.5" r="1.5" fill="currentColor"/>
            <circle cx="14.5" cy="9.5" r="1.5" fill="currentColor"/>
            <path d="M12 12C10.6 12 9.5 13.1 9.5 14.5H14.5C14.5 13.1 13.4 12 12 12Z" fill="currentColor"/>
            <path d="M6 19H18V21H6V19Z" fill="currentColor"/>
        </svg>`);

        // Register view
        this.registerView(
            VIEW_TYPE,
            (leaf) => (this.view = new LLMTaggerView(leaf, this))
        );

        // Add ribbon icon
        this.addRibbonIcon(ICON_NAME, 'LLM Tagger', () => {
            this.activateView();
        });

        // Wait for layout to be ready before setting up auto-tagging
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoAddTags) {
                this.enableAutoTagging();
            }
        });

        this.addCommand({
            id: 'add-tags',
            name: 'Add Tags to Documents',
            callback: () => this.addTagsToDocuments(),
        });

        this.addSettingTab(new LLMTaggerSettingTab(this.app, this));
        console.log('LLM Tagger plugin loaded');
    }

    private enableAutoTagging() {
        if (this.autoTaggingEnabled) return;
        this.autoTaggingEnabled = true;

        // Debounced auto-tag function to prevent multiple rapid calls
        const debouncedAutoTag = debounce(async (file: TFile) => {
            await this.autoTagFile(file);
        }, 2000, true);

        // Handle new files
        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (this.autoTaggingEnabled && file instanceof TFile && file.extension === 'md') {
                    await debouncedAutoTag(file);
                }
            })
        );

        // Handle modified files
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (this.autoTaggingEnabled && file instanceof TFile && file.extension === 'md') {
                    await debouncedAutoTag(file);
                }
            })
        );
    }

    private disableAutoTagging() {
        this.autoTaggingEnabled = false;
    }

    private async autoTagFile(file: TFile) {
        // Don't process if auto-tagging is disabled or no model is selected
        if (!this.settings.autoAddTags || !this.settings.selectedModel || !this.settings.defaultTags.length) {
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            
            // Skip if content is empty
            if (!content.trim()) {
                return;
            }

            const taggedContent = await this.processContentWithOllama(
                content, 
                this.settings.defaultTags
            );

            // Only update if tags were actually added
            if (taggedContent !== content) {
                await this.app.vault.modify(file, taggedContent);
                new Notice(`Auto-tagged: ${file.basename}`);
                this.settings.taggedFiles[file.path] = Date.now();
                await this.saveSettings();
            }
        } catch (error) {
            console.error('Error auto-tagging file:', error);
            new Notice(`Failed to auto-tag ${file.basename}: ${error.message}`);
        }
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
        
        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({ type: VIEW_TYPE });
                leaf = rightLeaf;
            }
        }
        
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async onunload() {
        console.log('Unloading LLM Tagger plugin');
        this.disableAutoTagging();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // Update auto-tagging based on settings
        if (this.settings.autoAddTags) {
            this.enableAutoTagging();
        } else {
            this.disableAutoTagging();
        }
    }

    async getOllamaModels(): Promise<string[]> {
        try {
            const response = await fetch('http://localhost:11434/api/tags');
            const data = await response.json();
            return data.models?.map((model: any) => model.name) || [];
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            return [];
        }
    }

    async getUserDefinedTags(): Promise<string[] | null> {
        return new Promise(async (resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText("Configure Tags");
            
            // Create model selection dropdown
            const modelContainer = modal.contentEl.createDiv();
            modelContainer.style.marginBottom = '1em';
            const modelLabel = modelContainer.createEl('label');
            modelLabel.setText('Select Ollama Model:');
            const modelSelect = modelContainer.createEl('select');
            modelSelect.style.width = '100%';
            modelSelect.style.marginTop = '0.5em';

            // Add a placeholder option
            const placeholderOption = modelSelect.createEl('option');
            placeholderOption.value = '';
            placeholderOption.text = 'Select a model...';
            placeholderOption.disabled = true;
            placeholderOption.selected = !this.settings.selectedModel;

            try {
                const models = await this.getOllamaModels();
                models.forEach(model => {
                    const option = modelSelect.createEl('option');
                    option.value = model;
                    option.text = model;
                    if (model === this.settings.selectedModel) {
                        option.selected = true;
                    }
                });
            } catch (error) {
                console.error('Failed to load models:', error);
                const option = modelSelect.createEl('option');
                option.text = 'Failed to load models';
                option.disabled = true;
            }

            // Tags input
            const tagsContainer = modal.contentEl.createDiv();
            tagsContainer.style.marginTop = '1em';
            const tagsLabel = tagsContainer.createEl('label');
            tagsLabel.setText('Enter tags (comma-separated):');
            const input = tagsContainer.createEl('textarea');
            input.style.width = '100%';
            input.style.height = '100px';
            input.style.marginTop = '0.5em';
            input.placeholder = 'Enter tags separated by commas...';
            if (this.settings.defaultTags.length > 0) {
                input.value = this.settings.defaultTags.join(', ');
            }

            const buttonContainer = modal.contentEl.createDiv();
            buttonContainer.style.marginTop = '1em';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'flex-end';
            buttonContainer.style.gap = '10px';

            const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
            const okButton = buttonContainer.createEl('button', { text: 'OK', cls: 'mod-cta' });

            cancelButton.addEventListener('click', () => {
                resolve(null);
                modal.close();
            });

            okButton.addEventListener('click', () => {
                if (!modelSelect.value) {
                    new Notice('Please select a model first');
                    return;
                }
                const tagInput = input.value.trim();
                if (!tagInput) {
                    new Notice('Please enter at least one tag');
                    return;
                }
                this.settings.selectedModel = modelSelect.value;
                this.saveSettings();
                const tags = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);
                resolve(tags);
                modal.close();
            });

            modal.open();
        });
    }

    private addDeterministicTags(content: string, availableTags: string[]): string {
        // Convert content to lowercase for case-insensitive matching
        const lowerContent = content.toLowerCase();
        
        // Create a set to track which tags we've added to avoid duplicates
        const addedTags = new Set<string>();
        
        // Find matching tags
        for (const tag of availableTags) {
            // Remove # if present and convert to lowercase
            const cleanTag = tag.replace(/^#/, '').toLowerCase();
            
            // Check if the tag exists as a whole word in the content
            const regex = new RegExp(`\\b${cleanTag}\\b`, 'i');
            if (regex.test(lowerContent)) {
                addedTags.add(tag.startsWith('#') ? tag : `#${tag}`);
            }
        }
        
        if (addedTags.size === 0) {
            return content;
        }

        // Add tags at the start of the content, after any existing frontmatter
        const frontMatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        if (frontMatterMatch) {
            const frontMatter = frontMatterMatch[0];
            const restContent = content.slice(frontMatter.length);
            return `${frontMatter}${Array.from(addedTags).join(' ')} ${restContent}`;
        } else {
            return `${Array.from(addedTags).join(' ')} ${content}`;
        }
    }

    async processContentWithOllama(content: string, availableTags: string[]): Promise<string> {
        if (!this.settings.selectedModel) {
            throw new Error('No Ollama model selected');
        }

        // Skip if already tagged
        if (this.isAlreadyTagged(content)) {
            return content;
        }

        // First, add deterministic tags based on word matches
        let processedContent = this.addDeterministicTags(content, availableTags);

        // Get tag suggestions and placement from Ollama for additional semantic tagging
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                model: this.settings.selectedModel,
                prompt: `You are an expert at analyzing and tagging markdown documents. Your task is to create a brief tagged summary of the document content.

Available tags: ${availableTags.join(', ')}

Instructions:
1. Create a brief 1-2 sentence summary of the content
2. Add relevant tags from the provided list that WEREN'T already matched by word (don't repeat tags)
3. Only use tags from the provided list
4. Each tag MUST start with a # symbol
5. Keep the summary concise and focused

Content to analyze (with existing tags):
${processedContent}

Provide a tagged summary:`,
                stream: false
            }),
        });
        const data = await response.json();
        
        // Get the LLM's tagged summary
        const taggedSummary = data.response.trim();
        
        // If we got a valid response, combine it with metadata and original content
        if (taggedSummary) {
            const timestamp = new Date().toISOString();
            return `---
LLM-tagged: ${timestamp}
---

${taggedSummary}

---

${processedContent}`;
        }
        
        return processedContent;
    }

    private shouldProcessFile(file: TFile): boolean {
        const lastTagged = this.settings.taggedFiles[file.path];
        if (!lastTagged) return true;

        // Check if file has been modified since last tagging
        return file.stat.mtime > lastTagged;
    }

    private isAlreadyTagged(content: string): boolean {
        // Check if content already has our metadata section
        return content.includes('---\nLLM-tagged:');
    }

    async addTagsToDocuments(view?: LLMTaggerView) {
        if (!this.settings.selectedModel) {
            new Notice('Please select an Ollama model first');
            return;
        }

        const tags = await this.getUserDefinedTags();
        if (!tags) return; // User cancelled

        const files = this.app.vault.getMarkdownFiles();
        let processed = 0;
        let modified = 0;

        try {
            for (const file of files) {
                processed++;
                if (view) {
                    view.updateProgress(processed, files.length, file.basename);
                }

                // Skip if file hasn't been modified since last tagging
                if (!this.shouldProcessFile(file)) {
                    console.log(`Skipping ${file.basename} - already tagged and not modified`);
                    continue;
                }

                try {
                    const content = await this.app.vault.read(file);
                    
                    // Skip if already tagged
                    if (this.isAlreadyTagged(content)) {
                        console.log(`Skipping ${file.basename} - already has tag metadata`);
                        continue;
                    }
                    
                    const taggedContent = await this.processContentWithOllama(content, tags);
                    
                    // Only update if content changed
                    if (taggedContent !== content) {
                        await this.app.vault.modify(file, taggedContent);
                        this.settings.taggedFiles[file.path] = Date.now();
                        await this.saveSettings();
                        modified++;
                        new Notice(`Tagged: ${file.basename}`);
                    }
                } catch (error) {
                    console.error(`Error processing ${file.basename}:`, error);
                    new Notice(`Failed to process ${file.basename}: ${error.message}`);
                }
            }

            new Notice(`Completed! Tagged ${modified} of ${files.length} files`);
        } finally {
            if (view) {
                view.resetProgress();
            }
        }
    }
}

class LLMTaggerView extends ItemView {
    plugin: LLMTaggerPlugin;
    progressBar: HTMLProgressElement;
    progressText: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf, plugin: LLMTaggerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE;
    }

    getDisplayText() {
        return 'LLM Tagger';
    }

    getIcon(): string {
        return ICON_NAME;
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl('h2', { text: 'LLM Tagger' });

        // Model selection
        const modelContainer = container.createDiv();
        modelContainer.createEl('h3', { text: 'Select Model' });
        const modelSelect = modelContainer.createEl('select');
        modelSelect.style.width = '100%';
        modelSelect.style.marginBottom = '1em';

        // Add placeholder option
        const placeholderOption = modelSelect.createEl('option');
        placeholderOption.value = '';
        placeholderOption.text = 'Select a model...';
        placeholderOption.disabled = true;
        placeholderOption.selected = !this.plugin.settings.selectedModel;

        try {
            const models = await this.plugin.getOllamaModels();
            models.forEach(model => {
                const option = modelSelect.createEl('option');
                option.value = model;
                option.text = model;
                if (model === this.plugin.settings.selectedModel) {
                    option.selected = true;
                }
            });
        } catch (error) {
            console.error('Failed to load models:', error);
            const option = modelSelect.createEl('option');
            option.text = 'Failed to load models';
            option.disabled = true;
        }

        modelSelect.addEventListener('change', async () => {
            this.plugin.settings.selectedModel = modelSelect.value || null;
            await this.plugin.saveSettings();
        });

        // Tags input
        const tagsContainer = container.createDiv();
        tagsContainer.createEl('h3', { text: 'Enter Tags' });
        const tagsInput = tagsContainer.createEl('textarea');
        tagsInput.placeholder = 'Enter tags separated by commas...';
        tagsInput.style.width = '100%';
        tagsInput.style.height = '100px';
        tagsInput.style.marginBottom = '1em';
        if (this.plugin.settings.defaultTags.length > 0) {
            tagsInput.value = this.plugin.settings.defaultTags.join(', ');
        }

        // Progress section
        const progressContainer = container.createDiv();
        progressContainer.createEl('h3', { text: 'Progress' });
        
        // Create progress bar
        this.progressBar = progressContainer.createEl('progress', {
            attr: { value: '0', max: '100' }
        });
        this.progressBar.style.width = '100%';
        this.progressBar.style.marginBottom = '0.5em';

        // Progress text
        this.progressText = progressContainer.createDiv('progress-text');
        this.progressText.style.fontSize = '0.9em';
        this.progressText.style.color = 'var(--text-muted)';
        this.progressText.style.marginBottom = '1em';
        this.progressText.textContent = 'Ready to tag documents';

        // Start button
        const startButton = container.createEl('button', { 
            text: 'Start Tagging',
            cls: 'mod-cta'
        });
        startButton.style.width = '100%';

        startButton.addEventListener('click', async () => {
            if (!modelSelect.value) {
                new Notice('Please select a model first');
                return;
            }

            const tagInput = tagsInput.value.trim();
            if (!tagInput) {
                new Notice('Please enter at least one tag');
                return;
            }

            const tags = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);
            
            // Save tags as default if they changed
            if (tagInput !== this.plugin.settings.defaultTags.join(', ')) {
                this.plugin.settings.defaultTags = tags;
                await this.plugin.saveSettings();
            }

            startButton.disabled = true;
            try {
                await this.plugin.addTagsToDocuments(this);
            } finally {
                startButton.disabled = false;
            }
        });
    }

    updateProgress(current: number, total: number, filename: string) {
        const percentage = Math.round((current / total) * 100);
        this.progressBar.value = percentage;
        this.progressText.textContent = `Processing ${filename} (${current}/${total})`;
    }

    resetProgress() {
        this.progressBar.value = 0;
        this.progressText.textContent = 'Ready to tag documents';
    }
}

class LLMTaggerSettingTab extends PluginSettingTab {
    plugin: LLMTaggerPlugin;

    constructor(app: App, plugin: LLMTaggerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'LLM Tagger Settings'});

        new Setting(containerEl)
            .setName('Default Model')
            .setDesc('Select the default Ollama model to use')
            .addDropdown(async (dropdown) => {
                dropdown.addOption('', 'Select a model...');
                try {
                    const models = await this.plugin.getOllamaModels();
                    models.forEach(model => {
                        dropdown.addOption(model, model);
                    });
                    if (this.plugin.settings.selectedModel) {
                        dropdown.setValue(this.plugin.settings.selectedModel);
                    }
                } catch (error) {
                    console.error('Failed to load models:', error);
                    dropdown.addOption('error', 'Failed to load models');
                    dropdown.setDisabled(true);
                }
                dropdown.onChange(async (value) => {
                    this.plugin.settings.selectedModel = value || null;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Default Tags')
            .setDesc('Enter default tags (comma-separated) that will be pre-filled when adding tags')
            .addTextArea(text => text
                .setPlaceholder('tag1, tag2, tag3')
                .setValue(this.plugin.settings.defaultTags.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.defaultTags = value.split(',')
                        .map(tag => tag.trim())
                        .filter(tag => tag);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-add Tags')
            .setDesc('Automatically add tags to new documents')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoAddTags)
                .onChange(async (value) => {
                    this.plugin.settings.autoAddTags = value;
                    await this.plugin.saveSettings();
                }));
    }
}
