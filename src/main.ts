import {Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, ScenarioPluginSettings} from './settings';
import {KanbanView} from './ui/kanban-view';
import {DEFAULT_KANBAN_DATA, DEFAULT_REFERENCE_DATA, DEFAULT_REFERENCE_TABS, VIEW_TYPE_KANBAN} from './utils/constants';
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
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
