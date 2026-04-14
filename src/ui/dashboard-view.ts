import {App, ItemView, Modal, Notice, WorkspaceLeaf} from 'obsidian';
import type ScenarioPlugin from '../main';
import {CharacterEntry, CharacterNode, CharacterProject, CharacterRole, ColumnDef, ColumnId, DashboardViewKind, GanttPhase, GanttTask, GanttTaskStatus, KanbanItem, ReferenceTab} from '../types';
import {CHARACTER_ROLE_DEFS, COLUMN_DEFS, DEFAULT_GANTT_PHASES, DEFAULT_REF_PANEL_EMOJI, DEFAULT_REF_PANEL_TITLE, GANTT_SCALE_PX, VIEW_TYPE_KANBAN} from '../utils/constants';

// ── 드래그 페이로드 ───────────────────────────────────────────────────

interface KanbanDragPayload {
	columnId: ColumnId;
	noteTitle: string;
	parentTitle?: string;
}

interface ReferenceDragPayload {
	tabId: string;
	noteTitle: string;
}

const DRAG_TYPE_KANBAN    = 'application/x-kanban-item';
const DRAG_TYPE_REFERENCE = 'application/x-reference-item';
const DRAG_TYPE_REF_TAB   = 'application/x-reference-tab';
const DRAG_TYPE_CHARACTER = 'application/x-character-entry';

interface CharacterDragPayload {
	projectId: string;
	characterId: string;
}

// ── ID 생성 유틸 ──────────────────────────────────────────────────────

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ── 날짜 유틸 ─────────────────────────────────────────────────────────

/** 두 날짜 사이의 일수 차 (b - a) */
function diffDays(a: string, b: string): number {
	const msA = new Date(a).getTime();
	const msB = new Date(b).getTime();
	return Math.round((msB - msA) / 86400000);
}

function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
	const d = new Date(dateStr);
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

function formatMonthLabel(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleString('en-US', {month: 'long', year: 'numeric'}).toUpperCase();
}

function getWeekNumber(dateStr: string): number {
	const d = new Date(dateStr);
	const startOfYear = new Date(d.getFullYear(), 0, 1);
	return Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
}

function formatDayLabel(dateStr: string): string {
	return String(new Date(dateStr).getDate());
}

/** YYYY-MM-DD의 월요일을 구한다 */
function getMonday(dateStr: string): string {
	const d = new Date(dateStr);
	const day = d.getDay();
	const diff = (day === 0 ? -6 : 1 - day);
	d.setDate(d.getDate() + diff);
	return d.toISOString().slice(0, 10);
}

/** 월의 첫날 YYYY-MM-01 */
function getMonthStart(dateStr: string): string {
	return dateStr.slice(0, 8) + '01';
}

/** 다음 달 첫날 */
function getNextMonthStart(dateStr: string): string {
	const d = new Date(dateStr);
	d.setMonth(d.getMonth() + 1, 1);
	return d.toISOString().slice(0, 10);
}

// ═════════════════════════════════════════════════════════════════════════

export class DashboardView extends ItemView {
	plugin: ScenarioPlugin;

	// ── 칸반/참고자료 뷰 로컬 상태 ───────────────────────────────────
	private activeTabId    = '';
	private panelOpen      = true;
	private editingTabId:   string | null  = null;
	private editingColId:   ColumnId | null = null;
	private editingRefTitle = false;

	// ── 간트 뷰 로컬 상태 ─────────────────────────────────────────────
	private ganttEditingTaskId: string | null = null;
	private ganttEditingPhaseId: string | null = null;
	private ganttNewTaskPhaseId: string | null = null;

	// ── Character 뷰 로컬 상태 ────────────────────────────────────────
	private editingProjectId:    string | null = null;
	private editingCharacterId:  string | null = null;
	private selectedCharacterId: string | null = null;
	private _charSaveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ScenarioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType()    { return VIEW_TYPE_KANBAN; }
	getDisplayText() { return 'Animation Project Dashboard'; }
	getIcon()        { return 'layout-dashboard'; }

	async onOpen()  { this.renderBoard(); }
	async onClose() { this.contentEl.empty(); }
	refresh()       { this.renderBoard(); }

	// ═══════════════════════════════════════════════════════════════════
	// 루트 렌더
	// ═══════════════════════════════════════════════════════════════════

	private renderBoard(): void {
		// activeTabId 유효성 보정
		const tabs = this.plugin.settings.reference.customTabs;
		if (!tabs.some(t => t.id === this.activeTabId)) {
			this.activeTabId = tabs[0]?.id ?? '';
		}

		this.contentEl.empty();
		const root = this.contentEl.createDiv({cls: 'dashboard-root'});

		this.renderNav(root);

		const body = root.createDiv({cls: 'dashboard-body'});
		const view = this.plugin.settings.lastActiveView;
		if (view === 'gantt')          this.renderGanttBody(body);
		else if (view === 'character') this.renderCharacterBody(body);
		else                           this.renderStoryBody(body);
	}

	// ── 좌측 네비게이션 ───────────────────────────────────────────────

	private renderNav(root: HTMLElement): void {
		const nav = root.createDiv({cls: 'dashboard-nav'});

		const header = nav.createDiv({cls: 'dashboard-nav-header'});
		header.createDiv({cls: 'dashboard-nav-logo', text: '🎬'});
		const hText = header.createDiv({cls: 'dashboard-nav-header-text'});
		hText.createDiv({cls: 'dashboard-nav-title', text: 'Animation Project'});
		hText.createDiv({cls: 'dashboard-nav-subtitle', text: 'Dashboard'});

		const items = nav.createDiv({cls: 'dashboard-nav-items'});
		const current = this.plugin.settings.lastActiveView;

		const navItems: Array<{id: DashboardViewKind; icon: string; label: string}> = [
			{id: 'story',     icon: '📖', label: 'Story'},
			{id: 'gantt',     icon: '📊', label: 'Timeline/Gantt'},
			{id: 'character', icon: '👤', label: 'Character'},
		];

		for (const ni of navItems) {
			const el = items.createDiv({
				cls: ni.id === current
					? 'dashboard-nav-item dashboard-nav-item-active'
					: 'dashboard-nav-item',
			});
			el.createSpan({cls: 'dashboard-nav-item-icon', text: ni.icon});
			el.createSpan({cls: 'dashboard-nav-item-label', text: ni.label});
			el.addEventListener('click', () => {
				if (this.plugin.settings.lastActiveView === ni.id) return;
				this.plugin.settings.lastActiveView = ni.id;
				void this.plugin.saveSettings();
				this.renderBoard();
			});
		}
	}

	// ── Story 뷰 (칸반 + 참고자료) ────────────────────────────────────

	private renderStoryBody(body: HTMLElement): void {
		const wrapperEl = body.createDiv({cls: 'kanban-wrapper'});

		const boardEl = wrapperEl.createDiv({cls: 'kanban-board'});
		for (const colDef of COLUMN_DEFS) {
			this.renderColumn(boardEl, colDef);
		}

		this.renderReferencePanel(wrapperEl);
	}

	// ═══════════════════════════════════════════════════════════════════
	// Kanban Column & Item
	// ═══════════════════════════════════════════════════════════════════

	private renderColumn(parent: HTMLElement, colDef: ColumnDef): void {
		const columnEl = parent.createDiv({cls: 'kanban-column'});

		if (this.editingColId === colDef.id) {
			const editRow = columnEl.createDiv({cls: 'kanban-column-title-edit'});
			editRow.createSpan({text: colDef.emoji, cls: 'kanban-column-title-emoji'});
			const nameInput = editRow.createEl('input', {
				cls: 'kanban-column-title-input',
				attr: {type: 'text', value: this.plugin.settings.columnNames[colDef.id] ?? colDef.displayName},
			});
			nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					this.plugin.settings.columnNames[colDef.id] = nameInput.value.trim() || colDef.displayName;
					void this.plugin.saveSettings();
					this.editingColId = null;
					this.renderBoard();
				}
				if (e.key === 'Escape') { this.editingColId = null; this.renderBoard(); }
			});
			nameInput.addEventListener('blur', () => {
				if (this.editingColId !== colDef.id) return;
				this.plugin.settings.columnNames[colDef.id] = nameInput.value.trim() || colDef.displayName;
				void this.plugin.saveSettings();
				this.editingColId = null;
				this.renderBoard();
			});
			setTimeout(() => { nameInput.select(); }, 0);
		} else {
			const titleEl = columnEl.createEl('h3', {
				text: `${colDef.emoji} ${this.plugin.settings.columnNames[colDef.id] ?? colDef.displayName}`,
				cls: 'kanban-column-title',
				attr: {title: 'Double-click to rename'},
			});
			titleEl.addEventListener('dblclick', () => { this.editingColId = colDef.id; this.renderBoard(); });
		}

		const inputEl = columnEl.createEl('input', {
			cls: 'kanban-input',
			attr: {type: 'text', placeholder: colDef.placeholder},
		});
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter') return;
			const raw = inputEl.value.trim();
			if (!raw) return;
			const title = raw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
			if (!title) return;
			void this.addKanbanItem(colDef.id, title);
			inputEl.value = '';
		});

		const itemsEl = columnEl.createDiv({cls: 'kanban-items'});
		for (const item of this.plugin.settings.kanban.columns[colDef.id]) {
			this.renderKanbanItem(itemsEl, colDef.id, item, null, 0);
		}

		columnEl.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (!(e.target as HTMLElement).closest('.kanban-item')) {
				columnEl.addClass('kanban-column-dragover');
			}
		});
		columnEl.addEventListener('dragleave', (e: DragEvent) => {
			if (!columnEl.contains(e.relatedTarget as Node))
				columnEl.removeClass('kanban-column-dragover');
		});
		columnEl.addEventListener('drop', (e: DragEvent) => {
			void (async () => {
				e.preventDefault();
				columnEl.removeClass('kanban-column-dragover');
				if ((e.target as HTMLElement).closest('.kanban-item')) return;
				const dt = e.dataTransfer;
				if (!dt) return;
				const kanbanRaw = dt.getData(DRAG_TYPE_KANBAN);
				if (kanbanRaw) { await this.moveKanbanToColumn(JSON.parse(kanbanRaw) as KanbanDragPayload, colDef.id); return; }
				const refRaw = dt.getData(DRAG_TYPE_REFERENCE);
				if (refRaw) { await this.addKanbanItem(colDef.id, (JSON.parse(refRaw) as ReferenceDragPayload).noteTitle); return; }
				for (const title of this.extractNoteTitlesFromDrop(e)) {
					await this.addKanbanItem(colDef.id, title);
				}
			})();
		});
	}

	private renderKanbanItem(
		parent: HTMLElement,
		columnId: ColumnId,
		item: KanbanItem,
		parentItem: KanbanItem | null,
		depth: number,
	): void {
		const itemEl = parent.createDiv({
			cls: depth > 0 ? 'kanban-item kanban-item-child' : 'kanban-item',
		});
		if (depth > 0) itemEl.style.marginLeft = `${depth * 20}px`;

		itemEl.setAttribute('draggable', 'true');
		itemEl.addEventListener('dragstart', (e: DragEvent) => {
			e.dataTransfer?.setData(DRAG_TYPE_KANBAN, JSON.stringify({columnId, noteTitle: item.noteTitle, parentTitle: parentItem?.noteTitle}));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			setTimeout(() => itemEl.addClass('kanban-item-dragging'), 0);
		});
		itemEl.addEventListener('dragend', () => { itemEl.removeClass('kanban-item-dragging'); this.clearDragIndicators(); });

		itemEl.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault(); e.stopPropagation();
			this.clearDragIndicators();
			const r = itemEl.getBoundingClientRect();
			const relY = e.clientY - r.top;
			if (relY < r.height * 0.25)       itemEl.addClass('kanban-item-drag-before');
			else if (relY > r.height * 0.75)   itemEl.addClass('kanban-item-drag-after');
			else if (depth === 0)               itemEl.addClass('kanban-item-drag-child');
			else                                itemEl.addClass('kanban-item-drag-after');
		});
		itemEl.addEventListener('dragleave', (e: DragEvent) => {
			if (!itemEl.contains(e.relatedTarget as Node))
				itemEl.removeClass('kanban-item-drag-before', 'kanban-item-drag-after', 'kanban-item-drag-child');
		});
		itemEl.addEventListener('drop', (e: DragEvent) => {
			void (async () => {
				e.preventDefault(); e.stopPropagation();
				const isBefore = itemEl.hasClass('kanban-item-drag-before');
				const isChild  = itemEl.hasClass('kanban-item-drag-child');
				this.clearDragIndicators();
				const dt = e.dataTransfer;
				if (!dt) return;
				const kanbanRaw = dt.getData(DRAG_TYPE_KANBAN);
				if (kanbanRaw) {
					const p = JSON.parse(kanbanRaw) as KanbanDragPayload;
					if (isChild) await this.makeKanbanChild(p, columnId, item);
					else         await this.reorderKanbanItem(p, columnId, item, parentItem, isBefore);
					return;
				}
				const refRaw = dt.getData(DRAG_TYPE_REFERENCE);
				if (refRaw) {
					const p = JSON.parse(refRaw) as ReferenceDragPayload;
					if (isChild) await this.addKanbanChildItem(columnId, item, p.noteTitle);
					else         await this.addKanbanItem(columnId, p.noteTitle);
					return;
				}
				const titles = this.extractNoteTitlesFromDrop(e);
				if (titles.length === 0) return;
				for (const title of titles) {
					if (isChild) await this.addKanbanChildItem(columnId, item, title);
					else         await this.addKanbanItem(columnId, title);
				}
			})();
		});

		const linkEl = itemEl.createEl('a', {text: item.noteTitle, cls: 'kanban-link'});
		linkEl.addEventListener('click', (e: MouseEvent) => { e.preventDefault(); void this.app.workspace.openLinkText(item.noteTitle, '', false); });
		linkEl.addEventListener('mouseover', (e: MouseEvent) => {
			this.app.workspace.trigger('hover-link', {event: e, source: VIEW_TYPE_KANBAN, hoverParent: this, targetEl: linkEl, linktext: item.noteTitle, sourcePath: ''});
		});

		const deleteBtn = itemEl.createSpan({text: '×', cls: 'kanban-item-delete'});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			void this.removeKanbanItem(columnId, item, parentItem);
		});

		if (item.children?.length) {
			for (const child of item.children)
				this.renderKanbanItem(parent, columnId, child, item, depth + 1);
		}
	}

	// ═══════════════════════════════════════════════════════════════════
	// Reference Panel
	// ═══════════════════════════════════════════════════════════════════

	private renderReferencePanel(wrapperEl: HTMLElement): void {
		const toggleBtn = wrapperEl.createDiv({cls: 'ref-panel-toggle'});
		toggleBtn.createSpan({text: this.panelOpen ? '📂' : '📁'});
		toggleBtn.addEventListener('click', () => {
			this.panelOpen = !this.panelOpen;
			this.editingRefTitle = false;
			this.renderBoard();
		});

		const panelEl = wrapperEl.createDiv({
			cls: this.panelOpen ? 'ref-panel ref-panel-open' : 'ref-panel ref-panel-closed',
		});
		if (!this.panelOpen) return;

		if (this.editingRefTitle) {
			const editRow = panelEl.createDiv({cls: 'ref-panel-title-edit'});
			editRow.createSpan({text: DEFAULT_REF_PANEL_EMOJI, cls: 'ref-panel-title-emoji'});
			const titleInput = editRow.createEl('input', {
				cls: 'ref-panel-title-input',
				attr: {type: 'text', value: this.plugin.settings.refPanelTitle},
			});
			titleInput.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					this.plugin.settings.refPanelTitle = titleInput.value.trim() || DEFAULT_REF_PANEL_TITLE;
					void this.plugin.saveSettings();
					this.editingRefTitle = false;
					this.renderBoard();
				}
				if (e.key === 'Escape') { this.editingRefTitle = false; this.renderBoard(); }
			});
			titleInput.addEventListener('blur', () => {
				if (!this.editingRefTitle) return;
				this.plugin.settings.refPanelTitle = titleInput.value.trim() || DEFAULT_REF_PANEL_TITLE;
				void this.plugin.saveSettings();
				this.editingRefTitle = false;
				this.renderBoard();
			});
			setTimeout(() => { titleInput.select(); }, 0);
		} else {
			const titleEl = panelEl.createEl('h3', {
				text: `${DEFAULT_REF_PANEL_EMOJI} ${this.plugin.settings.refPanelTitle}`,
				cls: 'ref-panel-title',
				attr: {title: 'Double-click to rename'},
			});
			titleEl.addEventListener('dblclick', () => { this.editingRefTitle = true; this.renderBoard(); });
		}
		this.renderTabBar(panelEl);

		if (this.activeTabId) {
			this.renderTabContent(panelEl, this.activeTabId);
		}
	}

	private renderTabBar(panelEl: HTMLElement): void {
		const tabBarEl = panelEl.createDiv({cls: 'ref-tabs'});
		const tabs = this.plugin.settings.reference.customTabs;

		for (const tab of tabs) {
			if (this.editingTabId === tab.id) {
				this.renderTabEditForm(tabBarEl, tab);
			} else {
				this.renderTabChip(tabBarEl, tab);
			}
		}

		const addBtn = tabBarEl.createDiv({cls: 'ref-tab ref-tab-add'});
		addBtn.setText('+');
		addBtn.setAttribute('aria-label', '새 탭 추가');
		addBtn.addEventListener('click', () => {
			void (async () => {
				const newTab: ReferenceTab = {
					id: generateId(),
					displayName: '새 탭',
					icon: '📁',
				};
				this.plugin.settings.reference.customTabs.push(newTab);
				this.plugin.settings.reference.items[newTab.id] = [];
				await this.plugin.saveSettings();
				this.activeTabId  = newTab.id;
				this.editingTabId = newTab.id;
				this.renderBoard();
			})();
		});
	}

	private renderTabChip(parent: HTMLElement, tab: ReferenceTab): void {
		const tabEl = parent.createDiv({
			cls: tab.id === this.activeTabId ? 'ref-tab ref-tab-active' : 'ref-tab',
		});

		tabEl.setAttribute('draggable', 'true');
		tabEl.addEventListener('dragstart', (e: DragEvent) => {
			e.dataTransfer?.setData(DRAG_TYPE_REF_TAB, tab.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			setTimeout(() => tabEl.addClass('ref-tab-dragging'), 0);
		});
		tabEl.addEventListener('dragend', () => {
			tabEl.removeClass('ref-tab-dragging');
			this.clearTabDragIndicators();
		});

		tabEl.addEventListener('dragover', (e: DragEvent) => {
			if (!e.dataTransfer?.types.includes(DRAG_TYPE_REF_TAB)) return;
			e.preventDefault();
			e.stopPropagation();
			this.clearTabDragIndicators();
			const rect = tabEl.getBoundingClientRect();
			if (e.clientX < rect.left + rect.width / 2) {
				tabEl.addClass('ref-tab-drag-before');
			} else {
				tabEl.addClass('ref-tab-drag-after');
			}
		});
		tabEl.addEventListener('dragleave', (e: DragEvent) => {
			if (!tabEl.contains(e.relatedTarget as Node)) {
				tabEl.removeClass('ref-tab-drag-before', 'ref-tab-drag-after');
			}
		});
		tabEl.addEventListener('drop', (e: DragEvent) => {
			void (async () => {
				e.preventDefault();
				e.stopPropagation();
				const isBefore = tabEl.hasClass('ref-tab-drag-before');
				this.clearTabDragIndicators();

				const draggedId = e.dataTransfer?.getData(DRAG_TYPE_REF_TAB);
				if (!draggedId || draggedId === tab.id) return;

				const tabs = this.plugin.settings.reference.customTabs;
				const fromIdx = tabs.findIndex(t => t.id === draggedId);
				if (fromIdx === -1) return;

				const moved = tabs.splice(fromIdx, 1)[0];
				if (!moved) return;
				const newToIdx = tabs.findIndex(t => t.id === tab.id);
				tabs.splice(isBefore ? newToIdx : newToIdx + 1, 0, moved);

				await this.plugin.saveSettings();
				this.renderBoard();
			})();
		});

		tabEl.addEventListener('click', () => {
			this.activeTabId  = tab.id;
			this.editingTabId = null;
			this.renderBoard();
		});
		tabEl.addEventListener('dblclick', (e: MouseEvent) => {
			e.stopPropagation();
			this.activeTabId  = tab.id;
			this.editingTabId = tab.id;
			this.renderBoard();
		});

		tabEl.createSpan({text: `📁 ${tab.displayName}`, cls: 'ref-tab-label'});

		const deleteBtn = tabEl.createSpan({text: '×', cls: 'ref-tab-delete-btn'});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			new ConfirmDeleteTabModal(this.app, tab.displayName, () => { void this.deleteTab(tab.id); }).open();
		});
	}

	private renderTabEditForm(parent: HTMLElement, tab: ReferenceTab): void {
		const formEl = parent.createDiv({cls: 'ref-tab-form'});

		const nameInput = formEl.createEl('input', {
			cls: 'ref-tab-form-name',
			attr: {type: 'text', value: tab.displayName, placeholder: '탭 이름'},
		});

		const saveBtn = formEl.createSpan({text: '✓', cls: 'ref-tab-form-btn ref-tab-form-save'});

		const doSave = async () => {
			const newName = nameInput.value.trim();
			if (!newName) { new Notice('탭 이름을 입력해주세요.'); return; }
			tab.displayName  = newName;
			tab.icon         = '📁';
			this.editingTabId = null;
			await this.plugin.saveSettings();
			this.renderBoard();
		};
		saveBtn.addEventListener('click', () => { void doSave(); });
		nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
			void (async () => {
				if (e.key === 'Enter')  { await doSave(); }
				if (e.key === 'Escape') {
					const isNew = this.plugin.settings.reference.customTabs.find(t => t.id === tab.id)?.displayName === '새 탭';
					if (isNew) { void this.deleteTab(tab.id); return; }
					this.editingTabId = null;
					this.renderBoard();
				}
			})();
		});

		const cancelBtn = formEl.createSpan({text: '✗', cls: 'ref-tab-form-btn ref-tab-form-cancel'});
		cancelBtn.addEventListener('click', () => {
			const isNew = this.plugin.settings.reference.customTabs.find(t => t.id === tab.id)?.displayName === '새 탭';
			if (isNew) { void this.deleteTab(tab.id); return; }
			this.editingTabId = null;
			this.renderBoard();
		});

		setTimeout(() => { nameInput.select(); }, 0);
	}

	private async deleteTab(tabId: string): Promise<void> {
		const tabs = this.plugin.settings.reference.customTabs;
		if (tabs.length <= 1) {
			new Notice('마지막 탭은 삭제할 수 없습니다.');
			return;
		}
		const idx = tabs.findIndex(t => t.id === tabId);
		if (idx !== -1) tabs.splice(idx, 1);
		delete this.plugin.settings.reference.items[tabId];
		this.editingTabId = null;
		if (this.activeTabId === tabId) {
			this.activeTabId = tabs[0]?.id ?? '';
		}
		await this.plugin.saveSettings();
		this.renderBoard();
	}

	private renderTabContent(panelEl: HTMLElement, tabId: string): void {
		const contentEl = panelEl.createDiv({cls: 'ref-tab-content'});

		const inputEl = contentEl.createEl('input', {
			cls: 'kanban-input',
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			attr: {type: 'text', placeholder: '[[Note Title]] or plain text + Enter'},
		});
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter') return;
			const raw = inputEl.value.trim();
			if (!raw) return;
			const title = raw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
			if (!title) return;
			void this.addRefItem(tabId, title);
			inputEl.value = '';
		});

		const itemsEl = contentEl.createDiv({cls: 'ref-items'});
		const items = this.plugin.settings.reference.items[tabId] ?? [];
		for (const item of items) {
			this.renderRefItem(itemsEl, tabId, item);
		}

		contentEl.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (!(e.target as HTMLElement).closest('.ref-item'))
				contentEl.addClass('ref-content-dragover');
		});
		contentEl.addEventListener('dragleave', (e: DragEvent) => {
			if (!contentEl.contains(e.relatedTarget as Node))
				contentEl.removeClass('ref-content-dragover');
		});
		contentEl.addEventListener('drop', (e: DragEvent) => {
			void (async () => {
				e.preventDefault();
				contentEl.removeClass('ref-content-dragover');
				if ((e.target as HTMLElement).closest('.ref-item')) return;
				for (const title of this.extractNoteTitlesFromDrop(e)) {
					await this.addRefItem(tabId, title);
				}
			})();
		});
	}

	private renderRefItem(parent: HTMLElement, tabId: string, item: KanbanItem): void {
		const itemEl = parent.createDiv({cls: 'ref-item'});
		itemEl.setAttribute('draggable', 'true');
		itemEl.addEventListener('dragstart', (e: DragEvent) => {
			e.dataTransfer?.setData(DRAG_TYPE_REFERENCE, JSON.stringify({tabId, noteTitle: item.noteTitle}));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
			setTimeout(() => itemEl.addClass('kanban-item-dragging'), 0);
		});
		itemEl.addEventListener('dragend', () => { itemEl.removeClass('kanban-item-dragging'); this.clearDragIndicators(); });

		const linkEl = itemEl.createEl('a', {text: item.noteTitle, cls: 'kanban-link'});
		linkEl.addEventListener('click', (e: MouseEvent) => { e.preventDefault(); void this.app.workspace.openLinkText(item.noteTitle, '', false); });
		linkEl.addEventListener('mouseover', (e: MouseEvent) => {
			this.app.workspace.trigger('hover-link', {event: e, source: VIEW_TYPE_KANBAN, hoverParent: this, targetEl: linkEl, linktext: item.noteTitle, sourcePath: ''});
		});

		const deleteBtn = itemEl.createSpan({text: '×', cls: 'kanban-item-delete'});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			void this.removeRefItem(tabId, item.noteTitle);
		});
	}

	// ═══════════════════════════════════════════════════════════════════
	// Character 뷰
	// ═══════════════════════════════════════════════════════════════════

	private renderCharacterBody(body: HTMLElement): void {
		const wrapper = body.createDiv({cls: 'character-wrapper'});

		const char = this.plugin.settings.character;
		const projects = char.projects;

		// activeProjectId 유효성 보정
		if (char.activeProjectId && !projects.some(p => p.id === char.activeProjectId)) {
			char.activeProjectId = projects[0]?.id ?? '';
		}

		const activeProject = projects.find(p => p.id === char.activeProjectId) ?? null;

		this.renderCharacterProjectPanel(wrapper);

		if (activeProject) {
			this.renderCharacterCanvas(wrapper, activeProject);
			this.renderCharacterDetailPanel(wrapper, activeProject);
		} else {
			// 빈 캔버스 영역 (canvas-wrapper 안에 넣어야 좌측 패널을 덮지 않음)
			const emptyCanvasWrapper = wrapper.createDiv({cls: 'character-canvas-wrapper'});
			const emptyCenter = emptyCanvasWrapper.createDiv({cls: 'character-empty-center'});
			emptyCenter.createDiv({cls: 'character-empty-icon', text: '👤'});
			emptyCenter.createDiv({cls: 'character-empty-title', text: 'No project selected'});
			emptyCenter.createDiv({cls: 'character-empty-desc', text: 'Create a project in the left panel to get started.'});
		}
	}

	// ── 왼쪽: 프로젝트 패널 ───────────────────────────────────────────

	private renderCharacterProjectPanel(wrapper: HTMLElement): void {
		const panel = wrapper.createDiv({cls: 'character-project-panel'});
		panel.createDiv({cls: 'character-panel-section-label', text: 'Projects'});

		const char = this.plugin.settings.character;
		const projects = char.projects;

		for (const project of projects) {
			if (this.editingProjectId === project.id) {
				const editRow = panel.createDiv({cls: 'character-project-edit-row'});
				const input = editRow.createEl('input', {
					cls: 'character-project-edit-input',
					attr: {type: 'text', value: project.name},
				});
				const save = async () => {
					project.name = input.value.trim() || project.name;
					this.editingProjectId = null;
					await this.plugin.saveSettings();
					this.renderBoard();
				};
				input.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') void save();
					if (e.key === 'Escape') { this.editingProjectId = null; this.renderBoard(); }
				});
				input.addEventListener('blur', () => void save());
				setTimeout(() => input.select(), 0);
			} else {
				const itemEl = panel.createDiv({
					cls: project.id === char.activeProjectId
						? 'character-project-item character-project-item-active'
						: 'character-project-item',
				});
				itemEl.createSpan({text: project.name, cls: 'character-project-item-name'});

				const deleteBtn = itemEl.createSpan({text: '×', cls: 'character-project-item-delete'});
				deleteBtn.addEventListener('click', (e: MouseEvent) => {
					e.stopPropagation();
					new ConfirmDeleteProjectModal(this.app, project.name, () => {
						const idx = projects.findIndex(p => p.id === project.id);
						if (idx !== -1) projects.splice(idx, 1);
						if (char.activeProjectId === project.id) {
							char.activeProjectId = projects[0]?.id ?? '';
						}
						void this.plugin.saveSettings();
						this.renderBoard();
					}).open();
				});

				itemEl.addEventListener('click', () => {
					char.activeProjectId = project.id;
					void this.plugin.saveSettings();
					this.renderBoard();
				});
				itemEl.addEventListener('dblclick', (e: MouseEvent) => {
					e.stopPropagation();
					this.editingProjectId = project.id;
					this.renderBoard();
				});
			}
		}

		const addBtn = panel.createDiv({cls: 'character-project-add-btn'});
		addBtn.createSpan({text: '+ New Project'});
		addBtn.addEventListener('click', () => {
			const newProject: CharacterProject = {
				id: generateId(),
				name: 'New Project',
				characters: [],
				nodes: [],
			};
			projects.push(newProject);
			char.activeProjectId = newProject.id;
			this.editingProjectId = newProject.id;
			void this.plugin.saveSettings();
			this.renderBoard();
		});
	}

	// ── 중앙: 캔버스 ──────────────────────────────────────────────────

	private renderCharacterCanvas(wrapper: HTMLElement, project: CharacterProject): void {
		const canvasWrapper = wrapper.createDiv({cls: 'character-canvas-wrapper'});
		const canvas = canvasWrapper.createDiv({cls: 'character-canvas'});

		// 파일 탐색기 + 오른쪽 패널 드롭 수락
		canvas.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			canvas.addClass('character-canvas-dragover');
		});
		canvas.addEventListener('dragleave', (e: DragEvent) => {
			if (!canvas.contains(e.relatedTarget as Node))
				canvas.removeClass('character-canvas-dragover');
		});
		canvas.addEventListener('drop', (e: DragEvent) => {
			e.preventDefault();
			canvas.removeClass('character-canvas-dragover');
			const dt = e.dataTransfer;
			if (!dt) return;

			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			// 1. 오른쪽 패널 캐릭터 드래그
			const charRaw = dt.getData(DRAG_TYPE_CHARACTER);
			if (charRaw) {
				const payload = JSON.parse(charRaw) as CharacterDragPayload;
				if (payload.projectId === project.id) {
					this.placeCharacterNode(project, payload.characterId, x, y);
				}
				return;
			}

			// 2. 파일 탐색기 드래그 → 캐릭터 등록 + 노드 동시 생성
			const titles = this.extractNoteTitlesFromDrop(e);
			let offset = 0;
			for (const title of titles) {
				let entry = project.characters.find(c => c.noteTitle === title);
				if (!entry) {
					entry = {id: generateId(), noteTitle: title, role: 'supporting', addedAt: Date.now()};
					project.characters.push(entry);
				}
				this.placeCharacterNode(project, entry.id, x + offset, y + offset);
				offset += 24;
			}
		});

		// 배경 클릭 → 선택 해제
		canvas.addEventListener('click', (e: MouseEvent) => {
			if (e.target === canvas) {
				this.selectedCharacterId = null;
				this.renderBoard();
			}
		});

		// 노드 렌더
		for (const node of project.nodes) {
			const char = project.characters.find(c => c.id === node.characterId);
			if (!char) continue;
			this.renderCharacterNode(canvas, project, node, char);
		}
	}

	private renderCharacterNode(
		canvas: HTMLElement,
		project: CharacterProject,
		node: CharacterNode,
		character: CharacterEntry,
	): void {
		const nodeEl = canvas.createDiv({
			cls: this.selectedCharacterId === character.id
				? 'character-node character-node-selected'
				: 'character-node',
		});
		nodeEl.style.left = `${node.x}px`;
		nodeEl.style.top  = `${node.y}px`;

		// 역할 표시
		const roleDef = CHARACTER_ROLE_DEFS.find(r => r.id === character.role) ?? CHARACTER_ROLE_DEFS[3]!;
		const header = nodeEl.createDiv({cls: 'character-node-header'});
		header.createSpan({text: character.noteTitle, cls: 'character-node-name'});
		header.createSpan({
			text: roleDef.label,
			cls: `character-node-role character-node-role-${character.role}`,
		});

		// 삭제 버튼
		const deleteBtn = nodeEl.createSpan({text: '×', cls: 'character-node-delete'});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			const idx = project.nodes.findIndex(n => n.characterId === character.id);
			if (idx !== -1) project.nodes.splice(idx, 1);
			if (this.selectedCharacterId === character.id) this.selectedCharacterId = null;
			void this.plugin.saveSettings();
			this.renderBoard();
		});

		// 클릭 → 선택
		nodeEl.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			this.selectedCharacterId = this.selectedCharacterId === character.id ? null : character.id;
			this.renderBoard();
		});

		// 더블클릭 → 노트 열기
		nodeEl.addEventListener('dblclick', (e: MouseEvent) => {
			e.stopPropagation();
			void this.app.workspace.openLinkText(character.noteTitle, '', false);
		});

		// 포인터 드래그 재배치
		let dragging = false;
		let startPx = 0, startPy = 0;
		let startNx = 0, startNy = 0;

		nodeEl.addEventListener('pointerdown', (e: PointerEvent) => {
			if ((e.target as HTMLElement).classList.contains('character-node-delete')) return;
			e.preventDefault();
			e.stopPropagation();
			dragging = true;
			startPx = e.clientX;
			startPy = e.clientY;
			startNx = node.x;
			startNy = node.y;
			nodeEl.setPointerCapture(e.pointerId);
			nodeEl.addClass('character-node-dragging');
		});

		nodeEl.addEventListener('pointermove', (e: PointerEvent) => {
			if (!dragging) return;
			nodeEl.style.left = `${Math.max(0, startNx + (e.clientX - startPx))}px`;
			nodeEl.style.top  = `${Math.max(0, startNy + (e.clientY - startPy))}px`;
		});

		const endDrag = (e: PointerEvent) => {
			if (!dragging) return;
			dragging = false;
			nodeEl.removeClass('character-node-dragging');
			node.x = Math.max(0, startNx + (e.clientX - startPx));
			node.y = Math.max(0, startNy + (e.clientY - startPy));
			this.saveCharacterDebounced();
		};
		nodeEl.addEventListener('pointerup',     endDrag);
		nodeEl.addEventListener('pointercancel', endDrag);
	}

	// ── 오른쪽: 캐릭터 디테일 패널 ───────────────────────────────────

	private renderCharacterDetailPanel(wrapper: HTMLElement, project: CharacterProject): void {
		const panel = wrapper.createDiv({cls: 'character-detail-panel'});

		// 헤더
		const header = panel.createDiv({cls: 'character-detail-header'});
		const titleRow = header.createDiv({cls: 'character-detail-title-row'});
		titleRow.createEl('h3', {text: 'Characters', cls: 'character-detail-title'});
		titleRow.createSpan({
			text: String(project.characters.length),
			cls: 'character-detail-count-pill',
		});

		// 텍스트 입력
		const inputEl = header.createEl('input', {
			cls: 'character-detail-input',
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			attr: {type: 'text', placeholder: '[[Note Title]] or plain text + Enter'},
		});
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter') return;
			const raw = inputEl.value.trim();
			if (!raw) return;
			const title = raw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
			if (!title) return;
			void this.addCharacterToProject(project, title);
			inputEl.value = '';
		});

		// 리스트 (파일 탐색기 드롭 허용)
		const list = panel.createDiv({cls: 'character-detail-list'});
		list.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			list.addClass('character-detail-list-dragover');
		});
		list.addEventListener('dragleave', (e: DragEvent) => {
			if (!list.contains(e.relatedTarget as Node))
				list.removeClass('character-detail-list-dragover');
		});
		list.addEventListener('drop', (e: DragEvent) => {
			void (async () => {
				e.preventDefault();
				list.removeClass('character-detail-list-dragover');
				for (const title of this.extractNoteTitlesFromDrop(e)) {
					await this.addCharacterToProject(project, title);
				}
			})();
		});

		for (const character of project.characters) {
			this.renderCharacterRow(list, project, character);
		}

		if (project.characters.length === 0) {
			list.createDiv({cls: 'character-detail-empty', text: 'Drop notes here or type a name above.'});
		}
	}

	private renderCharacterRow(
		list: HTMLElement,
		project: CharacterProject,
		character: CharacterEntry,
	): void {
		const isSelected = this.selectedCharacterId === character.id;
		const rowEl = list.createDiv({
			cls: isSelected
				? 'character-detail-row character-detail-row-selected'
				: 'character-detail-row',
		});

		// 캔버스로 드래그 출발
		rowEl.setAttribute('draggable', 'true');
		rowEl.addEventListener('dragstart', (e: DragEvent) => {
			e.dataTransfer?.setData(
				DRAG_TYPE_CHARACTER,
				JSON.stringify({projectId: project.id, characterId: character.id} as CharacterDragPayload),
			);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
			setTimeout(() => rowEl.addClass('character-detail-row-dragging'), 0);
		});
		rowEl.addEventListener('dragend', () => rowEl.removeClass('character-detail-row-dragging'));

		// 클릭 → 선택 동기화
		rowEl.addEventListener('click', () => {
			this.selectedCharacterId = isSelected ? null : character.id;
			this.renderBoard();
		});

		const roleDef = CHARACTER_ROLE_DEFS.find(r => r.id === character.role) ?? CHARACTER_ROLE_DEFS[3]!;

		if (this.editingCharacterId === character.id) {
			// 인라인 편집 폼
			const editRow = rowEl.createDiv({cls: 'character-detail-edit-row'});

			const nameInput = editRow.createEl('input', {
				cls: 'character-detail-name-input',
				attr: {type: 'text', value: character.noteTitle},
			});

			const roleSelect = editRow.createEl('select', {cls: 'character-detail-role-select'});
			for (const rd of CHARACTER_ROLE_DEFS) {
				const opt = roleSelect.createEl('option', {text: rd.label, attr: {value: rd.id}});
				if (rd.id === character.role) opt.selected = true;
			}

			const save = async () => {
				const newTitle = nameInput.value.trim();
				if (newTitle) character.noteTitle = newTitle;
				character.role = roleSelect.value as CharacterRole;
				this.editingCharacterId = null;
				await this.plugin.saveSettings();
				this.renderBoard();
			};

			nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') void save();
				if (e.key === 'Escape') { this.editingCharacterId = null; this.renderBoard(); }
			});
			// blur는 role select 클릭 시 오발사를 막기 위해 지연 처리
			nameInput.addEventListener('blur', () => {
				setTimeout(() => { if (this.editingCharacterId === character.id) void save(); }, 150);
			});

			const saveBtn = editRow.createSpan({text: '✓', cls: 'character-detail-save-btn'});
			saveBtn.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); void save(); });

			setTimeout(() => nameInput.select(), 0);
		} else {
			const infoEl = rowEl.createDiv({cls: 'character-detail-row-info'});
			const linkEl = infoEl.createEl('a', {text: character.noteTitle, cls: 'character-detail-name'});
			linkEl.addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				void this.app.workspace.openLinkText(character.noteTitle, '', false);
			});
			linkEl.addEventListener('mouseover', (e: MouseEvent) => {
				this.app.workspace.trigger('hover-link', {
					event: e, source: VIEW_TYPE_KANBAN, hoverParent: this,
					targetEl: linkEl, linktext: character.noteTitle, sourcePath: '',
				});
			});

			rowEl.createSpan({
				text: roleDef.label,
				cls: `character-detail-role-pill character-detail-role-pill-${character.role}`,
			});

			rowEl.addEventListener('dblclick', (e: MouseEvent) => {
				e.stopPropagation();
				this.editingCharacterId = character.id;
				this.renderBoard();
			});

			const deleteBtn = rowEl.createSpan({text: '×', cls: 'character-detail-delete-btn'});
			deleteBtn.addEventListener('click', (e: MouseEvent) => {
				e.stopPropagation();
				void this.removeCharacterFromProject(project, character.id);
			});
		}
	}

	// ── Character 데이터 조작 ─────────────────────────────────────────

	private placeCharacterNode(project: CharacterProject, characterId: string, x: number, y: number): void {
		const existing = project.nodes.find(n => n.characterId === characterId);
		if (existing) {
			existing.x = Math.max(0, x);
			existing.y = Math.max(0, y);
		} else {
			project.nodes.push({characterId, x: Math.max(0, x), y: Math.max(0, y)});
		}
		void this.plugin.saveSettings();
		this.renderBoard();
	}

	private async addCharacterToProject(project: CharacterProject, noteTitle: string): Promise<void> {
		if (project.characters.some(c => c.noteTitle === noteTitle)) {
			new Notice(`"${noteTitle}"은(는) 이미 등록되어 있습니다.`);
			return;
		}
		project.characters.push({id: generateId(), noteTitle, role: 'supporting', addedAt: Date.now()});
		await this.plugin.saveSettings();
		this.renderBoard();
	}

	private async removeCharacterFromProject(project: CharacterProject, characterId: string): Promise<void> {
		const idx = project.characters.findIndex(c => c.id === characterId);
		if (idx !== -1) project.characters.splice(idx, 1);
		project.nodes = project.nodes.filter(n => n.characterId !== characterId);
		if (this.selectedCharacterId === characterId) this.selectedCharacterId = null;
		await this.plugin.saveSettings();
		this.renderBoard();
	}

	/** 노드 드래그 중 빈번한 저장 방지용 디바운스 저장 (300ms) */
	private saveCharacterDebounced(): void {
		if (this._charSaveTimer !== null) clearTimeout(this._charSaveTimer);
		this._charSaveTimer = setTimeout(() => {
			this._charSaveTimer = null;
			void this.plugin.saveSettings();
		}, 300);
	}

	// ═══════════════════════════════════════════════════════════════════
	// 간트 뷰
	// ═══════════════════════════════════════════════════════════════════

	private renderGanttBody(body: HTMLElement): void {
		const wrapper = body.createDiv({cls: 'gantt-wrapper'});

		// 헤더 툴바
		this.renderGanttHeader(wrapper);

		// 본문 (사이드바 + 타임라인)
		const content = wrapper.createDiv({cls: 'gantt-content'});
		const sidebar  = content.createDiv({cls: 'gantt-sidebar'});
		const timeline = content.createDiv({cls: 'gantt-timeline'});

		const phases  = this.plugin.settings.gantt.phases;
		const scale   = this.plugin.settings.ganttScale;
		const pxPerDay = GANTT_SCALE_PX[scale];

		// 날짜 범위 계산
		const range = this.computeGanttDateRange();
		const totalDays = diffDays(range.start, range.end) + 1;
		const timelineWidth = totalDays * pxPerDay;

		// ── 타임라인 헤더 (월) ────────────────────────────────────
		const tlHeader = timeline.createDiv({cls: 'gantt-timeline-header'});
		tlHeader.style.minWidth = `${timelineWidth}px`;

		// ── 타임라인 서브헤더 (주/일) ─────────────────────────────
		const tlSubheader = timeline.createDiv({cls: 'gantt-timeline-subheader'});
		tlSubheader.style.minWidth = `${timelineWidth}px`;

		if (scale === 'monthly') {
			this.renderMonthlyHeader(tlHeader, tlSubheader, range, pxPerDay, totalDays);
		} else if (scale === 'weekly') {
			this.renderWeeklyHeader(tlHeader, tlSubheader, range, pxPerDay, totalDays);
		} else {
			this.renderDailyHeader(tlHeader, tlSubheader, range, pxPerDay, totalDays);
		}

		// ── 바 컨테이너 ───────────────────────────────────────────
		const barsArea = timeline.createDiv({cls: 'gantt-bars'});
		barsArea.style.minWidth = `${timelineWidth}px`;
		barsArea.style.position = 'relative';

		// "오늘" 인디케이터
		const todayOffset = diffDays(range.start, todayStr());
		if (todayOffset >= 0 && todayOffset <= totalDays) {
			const todayLine = barsArea.createDiv({cls: 'gantt-today-line'});
			todayLine.style.left = `${todayOffset * pxPerDay}px`;
			const dot = todayLine.createDiv({cls: 'gantt-today-dot'});
			dot.setAttribute('title', `Today: ${todayStr()}`);
		}

		// ── 각 페이즈 렌더 ────────────────────────────────────────
		for (const phase of phases) {
			const tasks = this.plugin.settings.gantt.tasks[phase.id] ?? [];
			const isEditing = this.ganttEditingPhaseId === phase.id;

			// 사이드바: 페이즈 헤더
			const sidePhaseHeader = sidebar.createDiv({cls: `gantt-phase-header gantt-accent-${phase.accent}`});
			if (isEditing) {
				const input = sidePhaseHeader.createEl('input', {
					cls: 'gantt-phase-name-input',
					attr: {type: 'text', value: phase.displayName},
				});
				const save = () => {
					phase.displayName = input.value.trim() || phase.displayName;
					this.ganttEditingPhaseId = null;
					void this.plugin.saveSettings();
					this.renderBoard();
				};
				input.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') save();
					if (e.key === 'Escape') { this.ganttEditingPhaseId = null; this.renderBoard(); }
				});
				input.addEventListener('blur', save);
				setTimeout(() => input.select(), 0);
			} else {
				sidePhaseHeader.createSpan({text: phase.displayName, cls: 'gantt-phase-name'});
				sidePhaseHeader.addEventListener('dblclick', () => {
					this.ganttEditingPhaseId = phase.id;
					this.renderBoard();
				});
			}

			// 사이드바: 태스크 추가 버튼
			const addTaskBtn = sidePhaseHeader.createSpan({cls: 'gantt-phase-add-btn', text: '+'});
			addTaskBtn.setAttribute('title', `Add task to ${phase.displayName}`);
			addTaskBtn.addEventListener('click', (e: MouseEvent) => {
				e.stopPropagation();
				this.ganttNewTaskPhaseId = phase.id;
				this.ganttEditingPhaseId = null;
				this.renderBoard();
			});

			// 바 영역: 페이즈 헤더 스페이서
			const barPhaseHeader = barsArea.createDiv({cls: 'gantt-bar-phase-spacer'});
			barPhaseHeader.style.height = '34px';

			// 태스크 행 렌더
			for (const task of tasks) {
				this.renderGanttTaskRow(sidebar, barsArea, phase, task, range, pxPerDay);
			}

			// 신규 태스크 폼 (이 페이즈에만 표시)
			if (this.ganttNewTaskPhaseId === phase.id) {
				this.renderGanttNewTaskForm(sidebar, barsArea, phase);
			}
		}
	}

	private renderGanttHeader(wrapper: HTMLElement): void {
		const header = wrapper.createDiv({cls: 'gantt-header'});

		const leftArea = header.createDiv({cls: 'gantt-header-left'});
		leftArea.createEl('h2', {text: 'Timeline / Gantt', cls: 'gantt-title'});

		const rightArea = header.createDiv({cls: 'gantt-header-right'});

		// 스케일 토글
		const scaleToggle = rightArea.createDiv({cls: 'gantt-scale-toggle'});
		const scales: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];
		const labels: Record<string, string> = {daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly'};
		for (const s of scales) {
			const btn = scaleToggle.createEl('button', {
				text: labels[s],
				cls: s === this.plugin.settings.ganttScale
					? 'gantt-scale-btn gantt-scale-btn-active'
					: 'gantt-scale-btn',
			});
			btn.addEventListener('click', () => {
				this.plugin.settings.ganttScale = s;
				void this.plugin.saveSettings();
				this.renderBoard();
			});
		}

		// New Task 버튼 (첫 번째 페이즈에 추가)
		const newTaskBtn = rightArea.createEl('button', {text: '+ New Task', cls: 'gantt-new-task-btn'});
		newTaskBtn.addEventListener('click', () => {
			const firstPhase = this.plugin.settings.gantt.phases[0];
			if (!firstPhase) return;
			this.ganttNewTaskPhaseId = firstPhase.id;
			this.ganttEditingTaskId  = null;
			this.renderBoard();
		});
	}

	private renderGanttTaskRow(
		sidebar: HTMLElement,
		barsArea: HTMLElement,
		phase: GanttPhase,
		task: GanttTask,
		range: {start: string; end: string},
		pxPerDay: number,
	): void {
		const isEditing = this.ganttEditingTaskId === task.id;

		// 편집 중: gantt-task-name-row(height:34px) 대신 form-row 컨테이너 사용
		if (isEditing) {
			const formRow = sidebar.createDiv({cls: 'gantt-task-form-row'});
			this.renderGanttEditTaskForm(formRow, barsArea, phase, task, range, pxPerDay);
			return;
		}

		// 일반 사이드바 행
		const sideRow = sidebar.createDiv({cls: 'gantt-task-name-row'});
		sideRow.createSpan({text: task.title, cls: 'gantt-task-name-label'});
		const pct = sideRow.createSpan({text: `${task.progress}%`, cls: 'gantt-task-pct'});
		pct.style.opacity = task.progress > 0 ? '1' : '0';
		sideRow.addEventListener('mouseenter', () => { pct.style.opacity = '1'; });
		sideRow.addEventListener('mouseleave', () => { pct.style.opacity = task.progress > 0 ? '1' : '0'; });

		const deleteBtn = sideRow.createSpan({text: '×', cls: 'gantt-task-delete-btn'});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			void this.removeGanttTask(phase.id, task.id);
		});

		sideRow.addEventListener('dblclick', () => {
			this.ganttEditingTaskId  = task.id;
			this.ganttNewTaskPhaseId = null;
			this.renderBoard();
		});

		// 타임라인 바 행
		const barRow = barsArea.createDiv({cls: 'gantt-bar-row'});
		barRow.style.height = '34px';

		const leftPx  = Math.max(0, diffDays(range.start, task.startDate)) * pxPerDay;
		const spanDays = Math.max(1, diffDays(task.startDate, task.endDate) + 1);
		const widthPx = spanDays * pxPerDay;

		const bar = barRow.createDiv({cls: `gantt-bar gantt-bar-${phase.accent}`});
		bar.style.left  = `${leftPx}px`;
		bar.style.width = `${widthPx}px`;

		// 진행률 채움
		if (task.progress > 0) {
			const fill = bar.createDiv({cls: 'gantt-bar-fill'});
			fill.style.width = `${task.progress}%`;
		}

		// 라벨
		const label = bar.createDiv({cls: 'gantt-bar-label'});
		if (task.status === 'done') {
			label.setText(`Finished ${task.endDate}`);
		} else if (task.progress > 0) {
			label.setText(`In Progress (${task.progress}%)`);
		} else {
			label.setText(`${task.startDate} → ${task.endDate}`);
		}

		bar.addEventListener('dblclick', () => {
			this.ganttEditingTaskId  = task.id;
			this.ganttNewTaskPhaseId = null;
			this.renderBoard();
		});
	}

	private renderGanttNewTaskForm(sidebar: HTMLElement, barsArea: HTMLElement, phase: GanttPhase): void {
		const today = todayStr();
		const endDefault = addDaysStr(today, 13);

		const formRow = sidebar.createDiv({cls: 'gantt-task-form-row'});
		this.buildGanttTaskForm(formRow, phase, null, {
			title: '',
			startDate: today,
			endDate: endDefault,
			progress: 0,
			status: 'planned',
		});

		// 바 영역에 스페이서
		const spacer = barsArea.createDiv({cls: 'gantt-bar-row'});
		spacer.style.height = '80px';
	}

	private renderGanttEditTaskForm(
		container: HTMLElement,
		barsArea: HTMLElement,
		phase: GanttPhase,
		task: GanttTask,
		_range: {start: string; end: string},
		_pxPerDay: number,
	): void {
		this.buildGanttTaskForm(container, phase, task, {
			title:     task.title,
			startDate: task.startDate,
			endDate:   task.endDate,
			progress:  task.progress,
			status:    task.status,
		});

		// 바 영역에 스페이서 (편집 폼 높이 대응)
		const spacer = barsArea.createDiv({cls: 'gantt-bar-row'});
		spacer.style.height = '80px';
	}

	private buildGanttTaskForm(
		container: HTMLElement,
		phase: GanttPhase,
		task: GanttTask | null,
		defaults: {title: string; startDate: string; endDate: string; progress: number; status: GanttTaskStatus},
	): void {
		const form = container.createDiv({cls: 'gantt-task-form'});

		const titleInput = form.createEl('input', {
			cls: 'gantt-form-title',
			attr: {type: 'text', placeholder: 'Task title', value: defaults.title},
		});

		const dateRow = form.createDiv({cls: 'gantt-form-dates'});
		const startInput = dateRow.createEl('input', {
			cls: 'gantt-form-date',
			attr: {type: 'date', value: defaults.startDate, title: 'Start date'},
		});
		dateRow.createSpan({text: '→', cls: 'gantt-form-arrow'});
		const endInput = dateRow.createEl('input', {
			cls: 'gantt-form-date',
			attr: {type: 'date', value: defaults.endDate, title: 'End date'},
		});

		const progressRow = form.createDiv({cls: 'gantt-form-progress-row'});
		progressRow.createSpan({text: 'Progress:', cls: 'gantt-form-label'});
		const progressInput = progressRow.createEl('input', {
			cls: 'gantt-form-progress',
			attr: {type: 'range', min: '0', max: '100', value: String(defaults.progress)},
		});
		const progressVal = progressRow.createSpan({text: `${defaults.progress}%`, cls: 'gantt-form-progress-val'});
		progressInput.addEventListener('input', () => {
			progressVal.setText(`${progressInput.value}%`);
		});

		const btnRow = form.createDiv({cls: 'gantt-form-btns'});
		const saveBtn = btnRow.createEl('button', {text: '✓ Save', cls: 'gantt-form-save-btn'});
		const cancelBtn = btnRow.createEl('button', {text: 'Cancel', cls: 'gantt-form-cancel-btn'});

		const doSave = () => {
			const title = titleInput.value.trim();
			if (!title) { new Notice('Task title cannot be empty.'); return; }
			const start = (startInput as HTMLInputElement).value;
			const end   = (endInput as HTMLInputElement).value;
			if (!start || !end) { new Notice('Please set both start and end dates.'); return; }
			if (end < start) { new Notice('End date must be on or after start date.'); return; }
			const progress = parseInt((progressInput as HTMLInputElement).value, 10);
			const status: GanttTaskStatus = progress >= 100 ? 'done' : progress > 0 ? 'in-progress' : 'planned';

			if (task) {
				void this.updateGanttTask(phase.id, task.id, {title, startDate: start, endDate: end, progress, status});
			} else {
				void this.addGanttTask(phase.id, {title, startDate: start, endDate: end, progress, status});
			}
		};

		saveBtn.addEventListener('click', doSave);
		titleInput.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') doSave();
			if (e.key === 'Escape') { this.ganttEditingTaskId = null; this.ganttNewTaskPhaseId = null; this.renderBoard(); }
		});
		cancelBtn.addEventListener('click', () => {
			this.ganttEditingTaskId  = null;
			this.ganttNewTaskPhaseId = null;
			this.renderBoard();
		});

		setTimeout(() => titleInput.focus(), 0);
	}

	// ── 타임라인 헤더 렌더 ───────────────────────────────────────────

	private renderMonthlyHeader(
		monthRow: HTMLElement, weekRow: HTMLElement,
		range: {start: string; end: string}, pxPerDay: number, _totalDays: number,
	): void {
		let cur = getMonthStart(range.start);
		while (cur <= range.end) {
			const nextMonth = getNextMonthStart(cur);
			const days = Math.min(diffDays(cur, nextMonth), diffDays(cur, range.end) + 1);
			const w = days * pxPerDay;

			const cell = monthRow.createDiv({cls: 'gantt-th-cell'});
			cell.style.width = `${w}px`;
			cell.setText(formatMonthLabel(cur));

			// 서브헤더: 주차
			let wCur = getMonday(cur < range.start ? range.start : cur);
			while (wCur <= nextMonth && wCur <= range.end) {
				const wEnd = addDaysStr(wCur, 6);
				const wDays = diffDays(wCur < range.start ? range.start : wCur, wEnd > range.end ? range.end : wEnd) + 1;
				const ww = wDays * pxPerDay;
				const sub = weekRow.createDiv({cls: 'gantt-th-sub'});
				sub.style.width = `${Math.max(ww, 1)}px`;
				sub.setText(`W${getWeekNumber(wCur)}`);
				wCur = addDaysStr(wCur, 7);
			}

			cur = nextMonth;
		}
	}

	private renderWeeklyHeader(
		monthRow: HTMLElement, weekRow: HTMLElement,
		range: {start: string; end: string}, pxPerDay: number, totalDays: number,
	): void {
		// 월 헤더
		let cur = getMonthStart(range.start);
		while (cur <= range.end) {
			const nextMonth = getNextMonthStart(cur);
			const startClamped = cur < range.start ? range.start : cur;
			const endClamped = nextMonth > addDaysStr(range.end, 1) ? range.end : addDaysStr(nextMonth, -1);
			const days = diffDays(startClamped, endClamped) + 1;
			const cell = monthRow.createDiv({cls: 'gantt-th-cell'});
			cell.style.width = `${days * pxPerDay}px`;
			cell.setText(formatMonthLabel(cur));
			cur = nextMonth;
		}

		// 주 서브헤더
		let wCur = getMonday(range.start);
		while (wCur <= range.end) {
			const wEnd = addDaysStr(wCur, 6);
			const startClamped = wCur < range.start ? range.start : wCur;
			const endClamped   = wEnd > range.end ? range.end : wEnd;
			const days = diffDays(startClamped, endClamped) + 1;
			const sub = weekRow.createDiv({cls: 'gantt-th-sub'});
			sub.style.width = `${days * pxPerDay}px`;
			sub.setText(`W${getWeekNumber(wCur)}`);
			wCur = addDaysStr(wCur, 7);
		}

		void totalDays;
	}

	private renderDailyHeader(
		monthRow: HTMLElement, weekRow: HTMLElement,
		range: {start: string; end: string}, pxPerDay: number, _totalDays: number,
	): void {
		// 월 헤더
		let cur = getMonthStart(range.start);
		while (cur <= range.end) {
			const nextMonth = getNextMonthStart(cur);
			const startClamped = cur < range.start ? range.start : cur;
			const endClamped   = nextMonth > addDaysStr(range.end, 1) ? range.end : addDaysStr(nextMonth, -1);
			const days = diffDays(startClamped, endClamped) + 1;
			const cell = monthRow.createDiv({cls: 'gantt-th-cell'});
			cell.style.width = `${days * pxPerDay}px`;
			cell.setText(formatMonthLabel(cur));
			cur = nextMonth;
		}

		// 일 서브헤더
		let dCur = range.start;
		while (dCur <= range.end) {
			const sub = weekRow.createDiv({cls: 'gantt-th-sub'});
			sub.style.width = `${pxPerDay}px`;
			sub.setText(formatDayLabel(dCur));
			dCur = addDaysStr(dCur, 1);
		}
	}

	// ── 날짜 범위 계산 ────────────────────────────────────────────────

	private computeGanttDateRange(): {start: string; end: string} {
		const allTasks = this.plugin.settings.gantt.phases.flatMap(
			p => this.plugin.settings.gantt.tasks[p.id] ?? []
		);
		if (allTasks.length === 0) {
			const today = todayStr();
			return {start: addDaysStr(today, -14), end: addDaysStr(today, 60)};
		}
		const starts = allTasks.map(t => t.startDate).sort();
		const ends   = allTasks.map(t => t.endDate).sort();
		const minStart = addDaysStr(starts[0]!, -7);
		const maxEnd   = addDaysStr(ends[ends.length - 1]!, 14);
		return {start: minStart, end: maxEnd};
	}

	// ═══════════════════════════════════════════════════════════════════
	// 공통 유틸
	// ═══════════════════════════════════════════════════════════════════

	private clearDragIndicators(): void {
		document.querySelectorAll('.kanban-item-drag-before, .kanban-item-drag-after, .kanban-item-drag-child')
			.forEach(el => el.classList.remove('kanban-item-drag-before', 'kanban-item-drag-after', 'kanban-item-drag-child'));
	}

	private clearTabDragIndicators(): void {
		document.querySelectorAll('.ref-tab-drag-before, .ref-tab-drag-after')
			.forEach(el => el.classList.remove('ref-tab-drag-before', 'ref-tab-drag-after'));
	}

	private extractNoteTitlesFromDrop(e: DragEvent): string[] {
		const dt = e.dataTransfer;
		if (!dt) return [];

		const textData = dt.getData('text/plain');
		if (textData) {
			const uriMatches = [...textData.matchAll(/obsidian:\/\/open\?[^\s\n]*/g)];
			if (uriMatches.length > 0) {
				const titles: string[] = [];
				for (const m of uriMatches) {
					try {
						const url = new URL(m[0]);
						const fp = url.searchParams.get('file');
						if (!fp) continue;
						const decoded = decodeURIComponent(fp);
						const name = decoded.replace(/\.md$/i, '').split('/').pop()?.trim();
						if (name) titles.push(name);
					} catch { /* malformed URI → skip */ }
				}
				if (titles.length > 0) return titles;
			}

			const wikiMatches = [...textData.matchAll(/\[\[([^\]]+)\]\]/g)];
			if (wikiMatches.length > 0) {
				return wikiMatches
					.map(m => (m[1] ?? '').replace(/\.md$/i, '').trim())
					.filter(Boolean);
			}

			const titles = textData.split(/\r?\n/)
				.map(line => line.trim())
				.filter(line => line && !line.startsWith('obsidian://'))
				.map(line => line.replace(/\.md$/i, '').trim())
				.filter(Boolean);
			return titles;
		}

		if (dt.files?.length) {
			return Array.from(dt.files)
				.map(f => f.name.replace(/\.md$/i, '').trim())
				.filter(Boolean);
		}

		return [];
	}

	// ═══════════════════════════════════════════════════════════════════
	// 칸반 데이터 조작
	// ═══════════════════════════════════════════════════════════════════

	private async addKanbanItem(columnId: ColumnId, noteTitle: string): Promise<void> {
		const items = this.plugin.settings.kanban.columns[columnId];
		if (items.some(i => i.noteTitle === noteTitle)) { new Notice(`"${noteTitle}"은(는) 이미 해당 컬럼에 있습니다.`); return; }
		items.push({noteTitle, addedAt: Date.now()});
		await this.plugin.saveSettings(); this.renderBoard();
	}

	private async addKanbanChildItem(columnId: ColumnId, parentItem: KanbanItem, childTitle: string): Promise<void> {
		if (!parentItem.children) parentItem.children = [];
		if (parentItem.children.some(c => c.noteTitle === childTitle)) { new Notice(`"${childTitle}"은(는) 이미 하위 항목에 있습니다.`); return; }
		parentItem.children.push({noteTitle: childTitle, addedAt: Date.now()});
		await this.plugin.saveSettings(); this.renderBoard();
	}

	private async removeKanbanItem(columnId: ColumnId, item: KanbanItem, parentItem: KanbanItem | null): Promise<void> {
		const items = this.plugin.settings.kanban.columns[columnId];
		if (parentItem) {
			if (!parentItem.children) return;
			parentItem.children = parentItem.children.filter(c => c.noteTitle !== item.noteTitle);
		} else {
			const idx = items.findIndex(i => i.noteTitle === item.noteTitle);
			if (idx !== -1) items.splice(idx, 1);
		}
		await this.plugin.saveSettings(); this.renderBoard();
	}

	private detachKanbanItem(payload: KanbanDragPayload): KanbanItem | null {
		const items = this.plugin.settings.kanban.columns[payload.columnId];
		if (payload.parentTitle) {
			const parent = items.find(i => i.noteTitle === payload.parentTitle);
			if (!parent?.children) return null;
			const idx = parent.children.findIndex(c => c.noteTitle === payload.noteTitle);
			return idx === -1 ? null : (parent.children.splice(idx, 1)[0] ?? null);
		}
		const idx = items.findIndex(i => i.noteTitle === payload.noteTitle);
		return idx === -1 ? null : (items.splice(idx, 1)[0] ?? null);
	}

	private async moveKanbanToColumn(payload: KanbanDragPayload, targetColumnId: ColumnId): Promise<void> {
		const item = this.detachKanbanItem(payload);
		if (!item) return;
		const targetItems = this.plugin.settings.kanban.columns[targetColumnId];
		if (targetItems.some(i => i.noteTitle === item.noteTitle)) {
			new Notice(`"${item.noteTitle}"은(는) 이미 해당 컬럼에 있습니다.`);
			this.plugin.settings.kanban.columns[payload.columnId].push(item);
		} else {
			targetItems.push(item);
		}
		await this.plugin.saveSettings(); this.renderBoard();
	}

	private async makeKanbanChild(payload: KanbanDragPayload, targetColumnId: ColumnId, targetItem: KanbanItem): Promise<void> {
		if (payload.noteTitle === targetItem.noteTitle) return;
		const item = this.detachKanbanItem(payload);
		if (!item) return;
		if (!targetItem.children) targetItem.children = [];
		if (targetItem.children.some(c => c.noteTitle === item.noteTitle)) {
			new Notice(`"${item.noteTitle}"은(는) 이미 하위 항목에 있습니다.`);
			this.plugin.settings.kanban.columns[payload.columnId].push(item);
		} else {
			targetItem.children.push({noteTitle: item.noteTitle, addedAt: item.addedAt});
		}
		await this.plugin.saveSettings(); this.renderBoard();
	}

	private async reorderKanbanItem(
		payload: KanbanDragPayload, targetColumnId: ColumnId,
		relativeToItem: KanbanItem, relativeToParent: KanbanItem | null, before: boolean,
	): Promise<void> {
		const item = this.detachKanbanItem(payload);
		if (!item) return;
		const arr = relativeToParent
			? (relativeToParent.children ?? this.plugin.settings.kanban.columns[targetColumnId])
			: this.plugin.settings.kanban.columns[targetColumnId];
		const idx = arr.findIndex(i => i.noteTitle === relativeToItem.noteTitle);
		arr.splice(before ? idx : idx + 1, 0, item);
		await this.plugin.saveSettings(); this.renderBoard();
	}

	// ═══════════════════════════════════════════════════════════════════
	// 참고자료 데이터 조작
	// ═══════════════════════════════════════════════════════════════════

	private async addRefItem(tabId: string, noteTitle: string): Promise<void> {
		const items = this.plugin.settings.reference.items[tabId] ?? [];
		this.plugin.settings.reference.items[tabId] = items;
		if (items.some(i => i.noteTitle === noteTitle)) {
			const tab = this.plugin.settings.reference.customTabs.find(t => t.id === tabId);
			new Notice(`"${noteTitle}"은(는) 이미 ${tab?.displayName ?? '해당 탭'}에 있습니다.`);
			return;
		}
		items.push({noteTitle, addedAt: Date.now()});
		await this.plugin.saveSettings(); this.renderBoard();
	}

	private async removeRefItem(tabId: string, noteTitle: string): Promise<void> {
		const items = this.plugin.settings.reference.items[tabId];
		if (!items) return;
		const idx = items.findIndex(i => i.noteTitle === noteTitle);
		if (idx !== -1) items.splice(idx, 1);
		await this.plugin.saveSettings(); this.renderBoard();
	}

	// ═══════════════════════════════════════════════════════════════════
	// 간트 데이터 조작
	// ═══════════════════════════════════════════════════════════════════

	private async addGanttTask(phaseId: string, data: Omit<GanttTask, 'id'>): Promise<void> {
		const tasks = this.plugin.settings.gantt.tasks[phaseId] ?? [];
		this.plugin.settings.gantt.tasks[phaseId] = tasks;
		tasks.push({id: generateId(), ...data});
		this.ganttNewTaskPhaseId = null;
		await this.plugin.saveSettings();
		this.renderBoard();
	}

	private async updateGanttTask(phaseId: string, taskId: string, patch: Partial<GanttTask>): Promise<void> {
		const tasks = this.plugin.settings.gantt.tasks[phaseId];
		if (!tasks) return;
		const t = tasks.find(t => t.id === taskId);
		if (!t) return;
		Object.assign(t, patch);
		this.ganttEditingTaskId = null;
		await this.plugin.saveSettings();
		this.renderBoard();
	}

	private async removeGanttTask(phaseId: string, taskId: string): Promise<void> {
		const tasks = this.plugin.settings.gantt.tasks[phaseId];
		if (!tasks) return;
		const idx = tasks.findIndex(t => t.id === taskId);
		if (idx !== -1) tasks.splice(idx, 1);
		await this.plugin.saveSettings();
		this.renderBoard();
	}
}

// ═════════════════════════════════════════════════════════════════════════
// 탭 삭제 확인 모달
// ═════════════════════════════════════════════════════════════════════════

class ConfirmDeleteTabModal extends Modal {
	private tabName: string;
	private onConfirm: () => void;

	constructor(app: App, tabName: string, onConfirm: () => void) {
		super(app);
		this.tabName   = tabName;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('confirm-delete-tab-modal');

		contentEl.createEl('h3', {text: '탭 삭제', cls: 'confirm-modal-title'});
		contentEl.createEl('p', {
			text: `"📁 ${this.tabName}" 탭과 탭 안의 모든 노트 목록을 삭제합니다.`,
			cls: 'confirm-modal-desc',
		});

		const btnRow = contentEl.createDiv({cls: 'confirm-modal-btns'});

		const deleteBtn = btnRow.createEl('button', {text: '삭제', cls: 'mod-warning'});
		deleteBtn.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});

		const cancelBtn = btnRow.createEl('button', {text: '취소'});
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}

class ConfirmDeleteProjectModal extends Modal {
	private projectName: string;
	private onConfirm: () => void;

	constructor(app: App, projectName: string, onConfirm: () => void) {
		super(app);
		this.projectName = projectName;
		this.onConfirm   = onConfirm;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('confirm-delete-tab-modal');

		contentEl.createEl('h3', {text: '프로젝트 삭제', cls: 'confirm-modal-title'});
		contentEl.createEl('p', {
			text: `"${this.projectName}" 프로젝트와 모든 캐릭터 데이터를 삭제합니다.`,
			cls: 'confirm-modal-desc',
		});

		const btnRow = contentEl.createDiv({cls: 'confirm-modal-btns'});

		const deleteBtn = btnRow.createEl('button', {text: '삭제', cls: 'mod-warning'});
		deleteBtn.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});

		const cancelBtn = btnRow.createEl('button', {text: '취소'});
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
