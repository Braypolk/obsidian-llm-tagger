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
    debounce,
    MarkdownView
} from 'obsidian';

const ICON_NAME = 'llm-tagger-robot';
const VIEW_TYPE = 'llm-tagger-view';

interface LLMTaggerSettings {
    selectedModel: string | null;
    defaultTags: string[];
    autoAddTags: boolean;
    taggedFiles: { [path: string]: number }; // Map of file paths to timestamp of last tagging
    excludePatterns: string[]; // Patterns for files/folders to exclude from tagging
}

const DEFAULT_SETTINGS: LLMTaggerSettings = {
    selectedModel: null,
    defaultTags: [],
    autoAddTags: false,
    taggedFiles: {},
    excludePatterns: []
}

export default class LLMTaggerPlugin extends Plugin {
    settings: LLMTaggerSettings;
    view: LLMTaggerView;
    private autoTaggingEnabled = false;
    private lastOpenFile: TFile | null = null;

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

        // Add command to tag documents
        this.addCommand({
            id: 'add-tags-to-documents',
            name: 'Add tags to documents',
            callback: () => {
                this.addTagsToDocuments(this.view);
            },
        });

        // Add command to untag all documents
        this.addCommand({
            id: 'untag-all-documents',
            name: 'Untag all documents',
            callback: () => {
                this.untagAllDocuments(this.view);
            },
        });

        // Add command to tag current document
        this.addCommand({
            id: 'tag-current-document',
            name: 'Tag current document',
            checkCallback: (checking) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    if (!checking) {
                        this.tagCurrentDocument();
                    }
                    return true;
                }
                return false;
            }
        });

        // Add command to untag current document
        this.addCommand({
            id: 'untag-current-document',
            name: 'Untag current document',
            checkCallback: (checking) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    if (!checking) {
                        this.untagCurrentDocument();
                    }
                    return true;
                }
                return false;
            }
        });

        // Enable auto-tagging if it's enabled in settings
        if (this.settings.autoAddTags) {
            this.enableAutoTagging();
        }
        
        // Register event for file opening and closing to handle auto-tagging
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                // If a file was previously open and it's different from the current file,
                // consider the previous file as "closed" and auto-tag it
                if (this.lastOpenFile && (!file || this.lastOpenFile.path !== file.path)) {
                    const previousFile = this.lastOpenFile;
                    
                    // Check if the file is a markdown file before attempting to tag it
                    if (previousFile instanceof TFile && previousFile.extension === 'md') {
                        // Use a small delay to ensure the file is fully saved
                        setTimeout(() => {
                            this.autoTagFileOnClose(previousFile);
                        }, 500);
                    }
                }
                
                // Update the lastOpenFile reference
                this.lastOpenFile = file instanceof TFile ? file : null;
            })
        );

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

        // Skip if file matches exclusion patterns or hasn't been modified since last tagging
        if (!this.shouldProcessFile(file)) {
            console.log(`Auto-tagging: Skipping ${file.basename} - excluded by pattern or not modified`);
            return;
        }

        // Skip if file is currently being edited
        if (this.isFileCurrentlyOpen(file)) {
            console.log(`Auto-tagging: Skipping ${file.basename} - file is currently open for editing`);
            return;
        }

        try {
            const initialContent = await this.app.vault.read(file);
            
            // Skip if content is empty
            if (!initialContent.trim()) {
                return;
            }

            const taggedContent = await this.processContentWithOllama(
                initialContent, 
                this.settings.defaultTags
            );

            // Verify file hasn't been modified while waiting for Ollama
            const currentContent = await this.app.vault.read(file);
            if (currentContent !== initialContent) {
                console.log(`Skipping ${file.basename} - content changed while processing`);
                return;
            }

            // Only update if tags were actually added
            if (taggedContent !== initialContent) {
                await this.app.vault.modify(file, taggedContent);
                this.settings.taggedFiles[file.path] = Date.now();
                await this.saveSettings();
            }
        } catch (error) {
            console.error('Error auto-tagging file:', error);
            new Notice(`Failed to auto-tag ${file.basename}: ${error.message}`);
        }
    }

    private async autoTagFileOnClose(file: TFile) {
        // Don't process if auto-tagging is disabled or no model is selected
        if (!this.settings.autoAddTags || !this.settings.selectedModel || !this.settings.defaultTags.length) {
            return;
        }

        // Skip if file matches exclusion patterns or hasn't been modified since last tagging
        if (!this.shouldProcessFile(file)) {
            console.log(`Auto-tagging on close: Skipping ${file.basename} - excluded by pattern or not modified`);
            return;
        }

        try {
            const initialContent = await this.app.vault.read(file);
            
            // Skip if content is empty
            if (!initialContent.trim()) {
                return;
            }

            const taggedContent = await this.processContentWithOllama(
                initialContent, 
                this.settings.defaultTags
            );

            // Verify file hasn't been modified while waiting for Ollama
            const currentContent = await this.app.vault.read(file);
            if (currentContent !== initialContent) {
                console.log(`Skipping ${file.basename} - content changed while processing`);
                return;
            }

            // Only update if tags were actually added
            if (taggedContent !== initialContent) {
                await this.app.vault.modify(file, taggedContent);
                this.settings.taggedFiles[file.path] = Date.now();
                await this.saveSettings();
            }
        } catch (error) {
            console.error('Error auto-tagging file on close:', error);
            new Notice(`Failed to auto-tag ${file.basename} on close: ${error.message}`);
        }
    }

    private isFileCurrentlyOpen(file: TFile): boolean {
        // Check all leaves in the workspace to see if the file is open
        const { workspace } = this.app;
        
        // Check if the file is open in any leaf
        let fileIsOpen = false;
        
        workspace.iterateAllLeaves(leaf => {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file && view.file.path === file.path) {
                fileIsOpen = true;
                return true; // Stop iteration
            }
        });
        
        return fileIsOpen;
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
            modal.titleEl.setText("Configure tags");
            
            // Create model selection dropdown
            const modelContainer = modal.contentEl.createDiv();
            modelContainer.addClass('model-container');
            const modelLabel = modelContainer.createEl('label');
            modelLabel.setText('Select Ollama model:');
            const modelSelect = modelContainer.createEl('select');
            modelSelect.addClass('model-select');

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
            tagsContainer.addClass('tags-container');
            const tagsLabel = tagsContainer.createEl('label');
            tagsLabel.setText('Enter tags (comma-separated):');
            const input = tagsContainer.createEl('textarea');
            
            // Pre-populate the tags input with saved tags from settings
            if (this.settings.defaultTags.length > 0) {
                input.value = this.settings.defaultTags.join(', ');
            }

            const buttonContainer = modal.contentEl.createDiv();
            buttonContainer.addClass('button-container');

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
                
                // Parse and save the tags to settings
                const tags = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);
                this.settings.defaultTags = tags;
                
                this.saveSettings();
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
        // Check if file matches any exclusion pattern
        if (this.settings.excludePatterns.length > 0) {
            const filePath = file.path.toLowerCase();
            
            for (const pattern of this.settings.excludePatterns) {
                // Handle patterns with or without wildcards
                if (pattern.includes('*')) {
                    // Convert glob pattern to regex
                    const regexPattern = pattern
                        .toLowerCase()
                        .replace(/\./g, '\\.')
                        .replace(/\*/g, '.*');
                    
                    const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|/${regexPattern}/`);
                    if (regex.test(filePath)) {
                        return false;
                    }
                } else {
                    // Simple string match for exact file or folder names
                    const normalizedPattern = pattern.toLowerCase();
                    
                    // Check if it's an exact file match
                    if (file.basename.toLowerCase() === normalizedPattern) {
                        return false;
                    }
                    
                    // Check if file is in a folder with this name
                    if (filePath.includes(`/${normalizedPattern}/`)) {
                        return false;
                    }
                }
            }
        }

        // If not excluded, check if it needs processing based on modification time
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
                    const initialContent = await this.app.vault.read(file);
                    
                    // Skip if already tagged
                    if (this.isAlreadyTagged(initialContent)) {
                        console.log(`Skipping ${file.basename} - already has tag metadata`);
                        continue;
                    }
                    
                    const taggedContent = await this.processContentWithOllama(initialContent, tags);

                    // Verify file hasn't been modified while waiting for Ollama
                    const currentContent = await this.app.vault.read(file);
                    if (currentContent !== initialContent) {
                        console.log(`Skipping ${file.basename} - content changed while processing`);
                        continue;
                    }

                    // Only update if tags were actually added
                    if (taggedContent !== initialContent) {
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
    
    async untagAllDocuments(view?: LLMTaggerView) {
        // Confirm before proceeding
        const confirmed = await new Promise<boolean>((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText("Confirm Untag All");
            
            const content = modal.contentEl.createDiv();
            content.setText("This will remove all tags and summaries added by LLM Tagger from your documents. This action cannot be undone. Are you sure you want to proceed?");
            
            const buttonContainer = modal.contentEl.createDiv();
            buttonContainer.addClass('button-container');
            
            const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
            const confirmButton = buttonContainer.createEl('button', { text: 'Untag All', cls: 'mod-warning' });
            
            cancelButton.addEventListener('click', () => {
                resolve(false);
                modal.close();
            });
            
            confirmButton.addEventListener('click', () => {
                resolve(true);
                modal.close();
            });
            
            modal.open();
        });
        
        if (!confirmed) return;
        
        const files = this.app.vault.getMarkdownFiles();
        let processed = 0;
        let modified = 0;
        
        try {
            for (const file of files) {
                processed++;
                if (view) {
                    view.updateProgress(processed, files.length, `Untagging: ${file.basename}`);
                }
                
                try {
                    const content = await this.app.vault.read(file);
                    let cleanedContent = content;
                    let wasModified = false;
                    
                    // Check if the file has LLM Tagger tags
                    if (this.isAlreadyTagged(content)) {
                        // Pattern to match the entire tagged section:
                        // 1. The metadata section with LLM-tagged
                        // 2. The summary text
                        // 3. The divider (---)
                        // 4. Optional newlines after the divider
                        const taggedSectionPattern = /---\nLLM-tagged:[\s\S]*?---\n\n[\s\S]*?\n\n---\n+/;
                        
                        // Remove the entire tagged section
                        cleanedContent = content.replace(taggedSectionPattern, '');
                        
                        if (cleanedContent !== content) {
                            wasModified = true;
                        }
                    }
                    
                    // Also look for tags at the beginning of the document (outside frontmatter)
                    const tagPattern = /^(#\w+\s*)+/;
                    if (tagPattern.test(cleanedContent)) {
                        // Remove tags at the beginning
                        cleanedContent = cleanedContent.replace(tagPattern, '').trim();
                        wasModified = true;
                    }
                    
                    // Update the file if content changed
                    if (wasModified) {
                        await this.app.vault.modify(file, cleanedContent);
                        modified++;
                        
                        // Remove from tagged files record
                        delete this.settings.taggedFiles[file.path];
                    }
                } catch (error) {
                    console.error(`Error untagging ${file.basename}:`, error);
                    new Notice(`Failed to untag ${file.basename}: ${error.message}`);
                }
            }
            
            // Save the updated tagged files record
            await this.saveSettings();
            
            new Notice(`Completed! Untagged ${modified} of ${files.length} files`);
        } finally {
            if (view) {
                view.resetProgress();
            }
        }
    }

    async tagCurrentDocument() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('Please open a markdown file first');
            return;
        }

        const tags = await this.getUserDefinedTags();
        if (!tags) return; // User cancelled

        try {
            const initialContent = await this.app.vault.read(activeFile);
            
            // Skip if already tagged
            if (this.isAlreadyTagged(initialContent)) {
                console.log(`Skipping ${activeFile.basename} - already has tag metadata`);
                return;
            }
            
            const taggedContent = await this.processContentWithOllama(initialContent, tags);

            // Verify file hasn't been modified while waiting for Ollama
            const currentContent = await this.app.vault.read(activeFile);
            if (currentContent !== initialContent) {
                console.log(`Skipping ${activeFile.basename} - content changed while processing`);
                return;
            }

            // Only update if tags were actually added
            if (taggedContent !== initialContent) {
                await this.app.vault.modify(activeFile, taggedContent);
                this.settings.taggedFiles[activeFile.path] = Date.now();
                await this.saveSettings();
                new Notice(`Tagged: ${activeFile.basename}`);
            }
        } catch (error) {
            console.error(`Error tagging ${activeFile.basename}:`, error);
            new Notice(`Failed to tag ${activeFile.basename}: ${error.message}`);
        }
    }

    async untagCurrentDocument() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('Please open a markdown file first');
            return;
        }

        try {
            const content = await this.app.vault.read(activeFile);
            let cleanedContent = content;
            let wasModified = false;
            
            // Check if the file has LLM Tagger tags
            if (this.isAlreadyTagged(content)) {
                // Pattern to match the entire tagged section:
                // 1. The metadata section with LLM-tagged
                // 2. The summary text
                // 3. The divider (---)
                // 4. Optional newlines after the divider
                const taggedSectionPattern = /---\nLLM-tagged:[\s\S]*?---\n\n[\s\S]*?\n\n---\n+/;
                
                // Remove the entire tagged section
                cleanedContent = content.replace(taggedSectionPattern, '');
                
                if (cleanedContent !== content) {
                    wasModified = true;
                }
            }
            
            // Also look for tags at the beginning of the document (outside frontmatter)
            const tagPattern = /^(#\w+\s*)+/;
            if (tagPattern.test(cleanedContent)) {
                // Remove tags at the beginning
                cleanedContent = cleanedContent.replace(tagPattern, '').trim();
                wasModified = true;
            }
            
            // Update the file if content changed
            if (wasModified) {
                await this.app.vault.modify(activeFile, cleanedContent);
                
                // Remove from tagged files record
                delete this.settings.taggedFiles[activeFile.path];
                await this.saveSettings();
                new Notice(`Untagged: ${activeFile.basename}`);
            }
        } catch (error) {
            console.error(`Error untagging ${activeFile.basename}:`, error);
            new Notice(`Failed to untag ${activeFile.basename}: ${error.message}`);
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
        modelContainer.addClass('model-container');
        modelContainer.createEl('h3', { text: 'Select model' });
        const modelSelect = modelContainer.createEl('select');
        modelSelect.addClass('model-select');

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
        tagsContainer.addClass('tags-container');
        tagsContainer.createEl('h3', { text: 'Enter tags' });
        const tagsInput = tagsContainer.createEl('textarea');
        
        // Pre-populate the tags input with saved tags from settings
        if (this.plugin.settings.defaultTags.length > 0) {
            tagsInput.value = this.plugin.settings.defaultTags.join(', ');
        }
        
        // Save tags when the textarea loses focus
        tagsInput.addEventListener('blur', async () => {
            const tagInput = tagsInput.value.trim();
            if (tagInput) {
                const tags = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);
                this.plugin.settings.defaultTags = tags;
                await this.plugin.saveSettings();
            }
        });

        // Progress section
        const progressContainer = container.createDiv();
        progressContainer.createEl('h3', { text: 'Progress' });
        
        // Create progress bar
        this.progressBar = progressContainer.createEl('progress');
        this.progressBar.addClass('progress-bar');
        this.progressBar.setAttribute('value', '0');
        this.progressBar.setAttribute('max', '100');

        // Progress text
        this.progressText = progressContainer.createDiv();
        this.progressText.addClass('progress-text');
        this.progressText.textContent = 'Ready to tag documents';

        // Buttons container for bulk operations
        const bulkButtonsContainer = container.createDiv();
        bulkButtonsContainer.addClass('buttons-container');
        bulkButtonsContainer.style.display = 'flex';
        bulkButtonsContainer.style.justifyContent = 'space-between';
        bulkButtonsContainer.style.marginTop = '20px';
        bulkButtonsContainer.createEl('h3', { text: 'Bulk Operations' });
        
        // Create a div for the bulk buttons
        const bulkButtonsDiv = bulkButtonsContainer.createDiv();
        bulkButtonsDiv.style.display = 'flex';
        bulkButtonsDiv.style.gap = '10px';
        
        // Start button
        const startButton = bulkButtonsDiv.createEl('button', { 
            text: 'Tag all documents',
            cls: 'mod-cta'
        });

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
        
        // Untag all button
        const untagButton = bulkButtonsDiv.createEl('button', { 
            text: 'Untag all documents',
            cls: 'mod-warning'
        });

        untagButton.addEventListener('click', async () => {
            untagButton.disabled = true;
            try {
                await this.plugin.untagAllDocuments(this);
            } finally {
                untagButton.disabled = false;
            }
        });
        
        // Current document operations
        const currentDocContainer = container.createDiv();
        currentDocContainer.addClass('current-doc-container');
        currentDocContainer.style.marginTop = '20px';
        currentDocContainer.createEl('h3', { text: 'Current Document' });
        
        // Create a div for the current document buttons
        const currentDocButtonsDiv = currentDocContainer.createDiv();
        currentDocButtonsDiv.style.display = 'flex';
        currentDocButtonsDiv.style.gap = '10px';
        
        // Tag current document button
        const tagCurrentButton = currentDocButtonsDiv.createEl('button', { 
            text: 'Tag current document',
            cls: 'mod-cta'
        });
        
        tagCurrentButton.addEventListener('click', async () => {
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
            
            tagCurrentButton.disabled = true;
            try {
                await this.plugin.tagCurrentDocument();
            } finally {
                tagCurrentButton.disabled = false;
            }
        });
        
        // Untag current document button
        const untagCurrentButton = currentDocButtonsDiv.createEl('button', { 
            text: 'Untag current document',
            cls: 'mod-warning'
        });
        
        untagCurrentButton.addEventListener('click', async () => {
            untagCurrentButton.disabled = true;
            try {
                await this.plugin.untagCurrentDocument();
            } finally {
                untagCurrentButton.disabled = false;
            }
        });
    }

    updateProgress(current: number, total: number, filename: string) {
        const percentage = Math.round((current / total) * 100);
        this.progressBar.setAttribute('value', percentage.toString());
        this.progressText.textContent = `Processing ${filename} (${current}/${total})`;
    }

    resetProgress() {
        this.progressBar.setAttribute('value', '0');
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

        new Setting(containerEl)
            .setName('Default model')
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
            .setName('Default tags')
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
            .setName('Auto-add tags')
            .setDesc('Automatically add tags to new documents')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoAddTags)
                .onChange(async (value) => {
                    this.plugin.settings.autoAddTags = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude patterns')
            .setDesc('Enter file/folder names or patterns to exclude from tagging (one per line). Supports * wildcard.')
            .addTextArea(text => {
                text.setPlaceholder('daily\nmeeting notes\ntemplates/*\n.excalidraw')
                    .setValue(this.plugin.settings.excludePatterns.join('\n'))
                    .onChange(async (value) => {
                        // Split by newlines and filter out empty lines
                        this.plugin.settings.excludePatterns = value
                            .split('\n')
                            .map(pattern => pattern.trim())
                            .filter(pattern => pattern);
                        await this.plugin.saveSettings();
                    });
                
                // Make the textarea taller
                text.inputEl.rows = 6;
                text.inputEl.cols = 40;
            });
    }
}
