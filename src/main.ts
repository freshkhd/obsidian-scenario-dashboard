import {Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, ScenarioPluginSettings} from './settings';
import {KanbanView} from './ui/kanban-view';
import {ScenarioSettingTab} from './ui/settings-tab';
import {COLUMN_DEFS, DEFAULT_COLUMN_NAMES, DEFAULT_KANBAN_DATA, DEFAULT_REFERENCE_DATA, DEFAULT_REFERENCE_TABS, DEFAULT_REF_PANEL_EMOJI, DEFAULT_REF_PANEL_TITLE, VIEW_TYPE_KANBAN} from './utils/constants';
import {ColumnId, KanbanItem} from './types';

export default class ScenarioPlugin extends Plugin {
	settings: ScenarioPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_KANBAN,
			(leaf) => new KanbanView(leaf, this)
		);

		this.addRibbonIcon('layout-dashboard', '시나리오 대시보드 열기', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-scenario-dashboard',
			name: 'Open dashboard',
			callback: () => this.activateView(),
		});

		this.addSettingTab(new ScenarioSettingTab(this.app, this));

		// 노트 이름이 변경되면 칸반 + 참고자료 데이터 자동 동기화
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;

				const oldTitle = oldPath.replace(/\.md$/i, '').split('/').pop() ?? '';
				const newTitle = file.basename;
				if (!oldTitle || oldTitle === newTitle) return;

				let changed = false;
				const updateItem = (item: KanbanItem) => {
					if (item.noteTitle === oldTitle) {
						item.noteTitle = newTitle;
						changed = true;
					}
					item.children?.forEach(updateItem);
				};

				// 칸반
				const cols = this.settings.kanban.columns;
				for (const colId of Object.keys(cols) as ColumnId[]) {
					cols[colId].forEach(updateItem);
				}

				// 참고자료
				const items = this.settings.reference.items;
				for (const tabId of Object.keys(items)) {
					(items[tabId] ?? []).forEach(updateItem);
				}

				if (changed) {
					void this.saveSettings();
					this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN).forEach(leaf => {
						(leaf.view as KanbanView).refresh();
					});
				}
			})
		);
	}

	/** Re-render all open dashboard leaves (called after settings change). */
	refreshViews(): void {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN).forEach(leaf => {
			(leaf.view as KanbanView).refresh();
		});
	}

	async activateView() {
		const {workspace} = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_KANBAN)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({type: VIEW_TYPE_KANBAN, active: true});
		}
		await workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		const raw = await this.loadData() as Partial<ScenarioPluginSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw) as ScenarioPluginSettings;

		// ── 칸반 초기화 ────────────────────────────────────────────────
		if (!this.settings.kanban) this.settings.kanban = DEFAULT_KANBAN_DATA;
		const columnIds: ColumnId[] = ['ideas', 'plot-development', 'project'];
		for (const colId of columnIds) {
			if (!this.settings.kanban.columns[colId]) {
				this.settings.kanban.columns[colId] = [];
			}
		}

		// ── 참고자료 초기화 + 구버전 마이그레이션 ───────────────────────
		if (!this.settings.reference) {
			this.settings.reference = DEFAULT_REFERENCE_DATA;
		} else if (!this.settings.reference.customTabs) {
			// 구버전 포맷 (tabs: Record<fixedId, KanbanItem[]>) → 신버전으로 마이그레이션
			const legacyTabs = (this.settings.reference as unknown as {tabs?: Record<string, KanbanItem[]>}).tabs;
			const migratedItems: Record<string, KanbanItem[]> = {};
			if (legacyTabs) {
				for (const id of Object.keys(legacyTabs)) {
					migratedItems[id] = legacyTabs[id] ?? [];
				}
			}
			this.settings.reference = {
				customTabs: DEFAULT_REFERENCE_TABS.map(t => ({...t})),
				items: migratedItems,
			};
		}

		// items 누락된 탭 보정
		if (!this.settings.reference.items) {
			this.settings.reference.items = {};
		}
		for (const tab of this.settings.reference.customTabs) {
			if (!this.settings.reference.items[tab.id]) {
				this.settings.reference.items[tab.id] = [];
			}
		}

		// ── 컬럼 이름 초기화 + 마이그레이션 ────────────────────────────
		if (!this.settings.columnNames) {
			this.settings.columnNames = {...DEFAULT_COLUMN_NAMES};
		} else {
			for (const colDef of COLUMN_DEFS) {
				if (!this.settings.columnNames[colDef.id]) {
					this.settings.columnNames[colDef.id] = DEFAULT_COLUMN_NAMES[colDef.id];
				} else {
					// 구버전: 이모지가 포함된 값이면 이모지 접두사 제거
					const stored = this.settings.columnNames[colDef.id];
					if (stored.startsWith(colDef.emoji)) {
						this.settings.columnNames[colDef.id] = stored.slice(colDef.emoji.length).trimStart() || DEFAULT_COLUMN_NAMES[colDef.id];
					}
				}
			}
		}

		// ── 참고자료 패널 제목 초기화 ────────────────────────────────────
		if (!this.settings.refPanelTitle) {
			this.settings.refPanelTitle = DEFAULT_REF_PANEL_TITLE;
		} else if (this.settings.refPanelTitle.startsWith(DEFAULT_REF_PANEL_EMOJI)) {
			// 구버전: 이모지가 포함된 값이면 제거
			this.settings.refPanelTitle = this.settings.refPanelTitle.slice(DEFAULT_REF_PANEL_EMOJI.length).trimStart() || DEFAULT_REF_PANEL_TITLE;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
