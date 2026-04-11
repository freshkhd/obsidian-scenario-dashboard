import {App, PluginSettingTab, Setting} from 'obsidian';
import type ScenarioPlugin from '../main';
import {COLUMN_DEFS, DEFAULT_COLUMN_NAMES, DEFAULT_REF_PANEL_EMOJI, DEFAULT_REF_PANEL_TITLE} from '../utils/constants';

export class ScenarioSettingTab extends PluginSettingTab {
	plugin: ScenarioPlugin;

	constructor(app: App, plugin: ScenarioPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		// ── Pipeline column labels ──────────────────────────────────────
		new Setting(containerEl).setName('Pipeline column labels').setHeading();

		for (const colDef of COLUMN_DEFS) {
			new Setting(containerEl)
				.setName(`${colDef.emoji} ${DEFAULT_COLUMN_NAMES[colDef.id]}`)
				.setDesc(`Text label only — the ${colDef.emoji} emoji is fixed. Default: "${DEFAULT_COLUMN_NAMES[colDef.id]}"`)
				.addText(text => {
					text
						.setValue(this.plugin.settings.columnNames[colDef.id] ?? colDef.displayName)
						.setPlaceholder(colDef.displayName)
						.onChange(value => {
							this.plugin.settings.columnNames[colDef.id] = value.trim() || colDef.displayName;
							void this.plugin.saveSettings();
							this.plugin.refreshViews();
						});
				});
		}

		// ── Reference panel ─────────────────────────────────────────────
		new Setting(containerEl).setName('Reference panel').setHeading();

		new Setting(containerEl)
			.setName(`${DEFAULT_REF_PANEL_EMOJI} Panel title`)
			.setDesc(`Text label only — the ${DEFAULT_REF_PANEL_EMOJI} emoji is fixed. Default: "${DEFAULT_REF_PANEL_TITLE}"`)
			.addText(text => {
				text
					.setValue(this.plugin.settings.refPanelTitle)
					.setPlaceholder(DEFAULT_REF_PANEL_TITLE)
					.onChange(value => {
						this.plugin.settings.refPanelTitle = value.trim() || DEFAULT_REF_PANEL_TITLE;
						void this.plugin.saveSettings();
						this.plugin.refreshViews();
					});
			});

		// ── Reset ───────────────────────────────────────────────────────
		new Setting(containerEl).setName('Reset').setHeading();

		new Setting(containerEl)
			.setName('Restore defaults')
			.setDesc('All column labels and the panel title will be restored to their built-in defaults.')
			.addButton(btn => {
				btn
					.setButtonText('Reset to defaults')
					.onClick(() => {
						for (const colDef of COLUMN_DEFS) {
							this.plugin.settings.columnNames[colDef.id] = DEFAULT_COLUMN_NAMES[colDef.id];
						}
						this.plugin.settings.refPanelTitle = DEFAULT_REF_PANEL_TITLE;
						void this.plugin.saveSettings();
						this.plugin.refreshViews();
						this.display();
					});
			});
	}
}
