import {Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, ScenarioPluginSettings} from './settings';
import {DashboardView} from './ui/dashboard-view';
import {ScenarioSettingTab} from './ui/settings-tab';
import {COLUMN_DEFS, DEFAULT_CHARACTER_DATA, DEFAULT_COLUMN_NAMES, DEFAULT_GANTT_DATA, DEFAULT_GANTT_PHASES, DEFAULT_GANTT_SCALE, DEFAULT_KANBAN_DATA, DEFAULT_LAST_VIEW, DEFAULT_REFERENCE_DATA, DEFAULT_REFERENCE_TABS, DEFAULT_REF_PANEL_EMOJI, DEFAULT_REF_PANEL_TITLE, VIEW_TYPE_KANBAN} from './utils/constants';
import {ColumnId, KanbanItem} from './types';

export default class ScenarioPlugin extends Plugin {
	settings: ScenarioPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_KANBAN,
			(leaf) => new DashboardView(leaf, this)
		);

		this.addRibbonIcon('layout-dashboard', 'Animation Project Dashboard 열기', () => {
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

				// Character 뷰
				for (const proj of (this.settings.character?.projects ?? [])) {
					for (const c of proj.characters) {
						if (c.noteTitle === oldTitle) {
							c.noteTitle = newTitle;
							changed = true;
						}
					}
				}

				if (changed) {
					void this.saveSettings();
					this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN).forEach(leaf => {
						(leaf.view as DashboardView).refresh();
					});
				}
			})
		);
	}

	/** Re-render all open dashboard leaves (called after settings change). */
	refreshViews(): void {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_KANBAN).forEach(leaf => {
			(leaf.view as DashboardView).refresh();
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
		const columnIds: ColumnId[] = ['ideas', 'step-outline', 'plot-development', 'treatment', 'project'];
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
					// 신규 컬럼(step-outline, treatment)은 기본값으로 채움
					this.settings.columnNames[colDef.id] = DEFAULT_COLUMN_NAMES[colDef.id];
				} else {
					// 구버전: 이모지가 포함된 값이면 이모지 접두사 제거
					const stored = this.settings.columnNames[colDef.id];
					if (stored.startsWith(colDef.emoji)) {
						this.settings.columnNames[colDef.id] = stored.slice(colDef.emoji.length).trimStart() || DEFAULT_COLUMN_NAMES[colDef.id];
					}
				}
			}
			// 구 기본값 → 새 기본값 자동 교체 (사용자가 직접 수정한 라벨은 유지)
			const legacyMap: Partial<Record<ColumnId, {was: string; now: string}>> = {
				'plot-development': {was: 'Plot Development', now: 'Plot'},
				'project':          {was: 'Project',          now: 'Scenario'},
			};
			for (const [id, m] of Object.entries(legacyMap) as [ColumnId, {was: string; now: string}][]) {
				if (this.settings.columnNames[id] === m.was) {
					this.settings.columnNames[id] = m.now;
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

		// ── 간트 초기화 ────────────────────────────────────────────────
		if (!this.settings.gantt) {
			this.settings.gantt = {
				phases: DEFAULT_GANTT_PHASES.map(p => ({...p})),
				tasks:  Object.fromEntries(DEFAULT_GANTT_PHASES.map(p => [p.id, []])),
			};
		}
		if (!this.settings.gantt.phases) this.settings.gantt.phases = DEFAULT_GANTT_PHASES.map(p => ({...p}));
		if (!this.settings.gantt.tasks)  this.settings.gantt.tasks  = {};
		for (const phase of this.settings.gantt.phases) {
			if (!this.settings.gantt.tasks[phase.id]) this.settings.gantt.tasks[phase.id] = [];
		}
		if (!this.settings.lastActiveView) this.settings.lastActiveView = DEFAULT_LAST_VIEW;
		if (!this.settings.ganttScale)     this.settings.ganttScale     = DEFAULT_GANTT_SCALE;

		// ── Character 초기화 ────────────────────────────────────────────
		if (!this.settings.character) {
			this.settings.character = {projects: [], activeProjectId: ''};
		}
		if (!Array.isArray(this.settings.character.projects)) {
			this.settings.character.projects = [];
		}
		for (const proj of this.settings.character.projects) {
			if (!Array.isArray(proj.characters)) proj.characters = [];
			if (!Array.isArray(proj.nodes))      proj.nodes      = [];
		}
		if (typeof this.settings.character.activeProjectId !== 'string') {
			this.settings.character.activeProjectId = '';
		}
		const charProjectIds = this.settings.character.projects.map(p => p.id);
		if (
			this.settings.character.activeProjectId &&
			!charProjectIds.includes(this.settings.character.activeProjectId)
		) {
			this.settings.character.activeProjectId = charProjectIds[0] ?? '';
		}
		void DEFAULT_CHARACTER_DATA; // 미사용 import 방지
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
