import {App, Notice, PluginSettingTab, Setting} from 'obsidian';
import type ScenarioPlugin from '../main';
import {COLUMN_DEFS, DEFAULT_COLUMN_NAMES, DEFAULT_GANTT_PHASES, DEFAULT_REF_PANEL_EMOJI, DEFAULT_REF_PANEL_TITLE} from '../utils/constants';
import {GanttAccent} from '../types';

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

		// ── Character ───────────────────────────────────────────────────
		new Setting(containerEl).setName('Character').setHeading();

		new Setting(containerEl)
			.setName('Reset all character data')
			.setDesc('Deletes all projects, characters, and canvas node positions. This cannot be undone.')
			.addButton(btn => {
				btn.setButtonText('Reset character data').setWarning().onClick(() => {
					// eslint-disable-next-line no-alert
					if (!confirm('모든 Character 데이터(프로젝트, 캐릭터, 노드 위치)를 삭제합니다. 계속하시겠습니까?')) return;
					this.plugin.settings.character = {projects: [], activeProjectId: ''};
					void this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
			});

		// ── Timeline / Gantt ────────────────────────────────────────────
		new Setting(containerEl).setName('Timeline / Gantt').setHeading();

		new Setting(containerEl)
			.setName('Phases')
			.setDesc('Manage the phase sections shown in the Gantt view. Double-click a phase name in the view to rename it inline.');

		const phasesContainer = containerEl.createDiv({cls: 'gantt-settings-phases'});
		this.renderPhaseList(phasesContainer);

		new Setting(containerEl)
			.setName('Add phase')
			.addButton(btn => {
				btn.setButtonText('+ Add phase').onClick(() => {
					const accents: GanttAccent[] = ['tertiary', 'secondary', 'muted'];
					const idx = this.plugin.settings.gantt.phases.length;
					const accent = accents[idx % accents.length] ?? 'muted';
					const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
					this.plugin.settings.gantt.phases.push({id, displayName: 'New Phase', accent});
					this.plugin.settings.gantt.tasks[id] = [];
					void this.plugin.saveSettings();
					this.plugin.refreshViews();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName('Reset phases to defaults')
			.addButton(btn => {
				btn.setButtonText('Reset phases').onClick(() => {
					this.plugin.settings.gantt.phases = DEFAULT_GANTT_PHASES.map(p => ({...p}));
					// 기본 페이즈 외 태스크는 유지하지 않음
					const defaultIds = new Set(DEFAULT_GANTT_PHASES.map(p => p.id));
					for (const id of Object.keys(this.plugin.settings.gantt.tasks)) {
						if (!defaultIds.has(id)) delete this.plugin.settings.gantt.tasks[id];
					}
					for (const phase of DEFAULT_GANTT_PHASES) {
						if (!this.plugin.settings.gantt.tasks[phase.id]) {
							this.plugin.settings.gantt.tasks[phase.id] = [];
						}
					}
					void this.plugin.saveSettings();
					this.plugin.refreshViews();
					this.display();
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

	private renderPhaseList(container: HTMLElement): void {
		container.empty();
		const phases = this.plugin.settings.gantt.phases;

		for (let i = 0; i < phases.length; i++) {
			const phase = phases[i]!;
			const row = new Setting(container)
				.setName(phase.displayName)
				.addText(text => {
					text.setValue(phase.displayName)
						.setPlaceholder('Phase name')
						.onChange(value => {
							phase.displayName = value.trim() || phase.displayName;
							void this.plugin.saveSettings();
							this.plugin.refreshViews();
						});
				})
				.addButton(btn => {
					btn.setButtonText('↑').setDisabled(i === 0).onClick(() => {
						phases.splice(i - 1, 0, phases.splice(i, 1)[0]!);
						void this.plugin.saveSettings();
						this.plugin.refreshViews();
						this.renderPhaseList(container);
					});
				})
				.addButton(btn => {
					btn.setButtonText('↓').setDisabled(i === phases.length - 1).onClick(() => {
						phases.splice(i + 1, 0, phases.splice(i, 1)[0]!);
						void this.plugin.saveSettings();
						this.plugin.refreshViews();
						this.renderPhaseList(container);
					});
				})
				.addButton(btn => {
					btn.setButtonText('Delete').setWarning().onClick(() => {
						if (phases.length <= 1) {
							new Notice('At least one phase is required.');
							return;
						}
						const tasks = this.plugin.settings.gantt.tasks[phase.id] ?? [];
						if (tasks.length > 0) {
							if (!confirm(`"${phase.displayName}" has ${tasks.length} task(s). Delete phase and all its tasks?`)) return;
						}
						phases.splice(i, 1);
						delete this.plugin.settings.gantt.tasks[phase.id];
						void this.plugin.saveSettings();
						this.plugin.refreshViews();
						this.renderPhaseList(container);
					});
				});

			void row;
		}
	}
}
