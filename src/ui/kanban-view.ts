import {App, ItemView, Modal, Notice, WorkspaceLeaf} from 'obsidian';
import type ScenarioPlugin from '../main';
import {ColumnDef, ColumnId, KanbanItem, ReferenceTab} from '../types';
import {COLUMN_DEFS, DEFAULT_REF_PANEL_EMOJI, DEFAULT_REF_PANEL_TITLE, VIEW_TYPE_KANBAN} from '../utils/constants';

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

// ── 탭 ID 생성 ────────────────────────────────────────────────────────

function generateTabId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ═════════════════════════════════════════════════════════════════════════

export class KanbanView extends ItemView {
	plugin: ScenarioPlugin;

	private activeTabId    = '';
	private panelOpen      = true;
	/** 인라인 편집 중인 탭 ID (null이면 편집 없음) */
	private editingTabId:  string | null  = null;
	/** 인라인 편집 중인 칸반 컬럼 ID (null이면 편집 없음) */
	private editingColId:  ColumnId | null = null;
	/** 참고자료 패널 제목 인라인 편집 중 여부 */
	private editingRefTitle = false;

	constructor(leaf: WorkspaceLeaf, plugin: ScenarioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType()    { return VIEW_TYPE_KANBAN; }
	getDisplayText() { return '시나리오 대시보드'; }
	getIcon()        { return 'layout-dashboard'; }

	async onOpen()  { this.renderBoard(); }
	async onClose() { this.contentEl.empty(); }
	refresh()       { this.renderBoard(); }

	// ═══════════════════════════════════════════════════════════════════
	// Board 루트
	// ═══════════════════════════════════════════════════════════════════

	private renderBoard(): void {
		// activeTabId 유효성 보정
		const tabs = this.plugin.settings.reference.customTabs;
		if (!tabs.some(t => t.id === this.activeTabId)) {
			this.activeTabId = tabs[0]?.id ?? '';
		}

		this.contentEl.empty();
		const wrapperEl = this.contentEl.createDiv({cls: 'kanban-wrapper'});

		// 좌측 칸반 보드
		const boardEl = wrapperEl.createDiv({cls: 'kanban-board'});
		for (const colDef of COLUMN_DEFS) {
			this.renderColumn(boardEl, colDef);
		}

		// 우측 참고자료 패널
		this.renderReferencePanel(wrapperEl);
	}

	// ═══════════════════════════════════════════════════════════════════
	// Kanban Column & Item (기존 로직 유지)
	// ═══════════════════════════════════════════════════════════════════

	private renderColumn(parent: HTMLElement, colDef: ColumnDef): void {
		const columnEl = parent.createDiv({cls: 'kanban-column'});

		// ── 컬럼 제목 (더블클릭으로 인라인 편집 / 이모지는 고정) ──────
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
			this.editingRefTitle = false; // 패널 토글 시 편집 취소
			this.renderBoard();
		});

		const panelEl = wrapperEl.createDiv({
			cls: this.panelOpen ? 'ref-panel ref-panel-open' : 'ref-panel ref-panel-closed',
		});
		if (!this.panelOpen) return;

		// ── 패널 제목 (더블클릭으로 인라인 편집 / 이모지는 고정) ──────
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

	// ── 탭 바 ──────────────────────────────────────────────────────────

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

		// "+" 새 탭 버튼
		const addBtn = tabBarEl.createDiv({cls: 'ref-tab ref-tab-add'});
		addBtn.setText('+');
		addBtn.setAttribute('aria-label', '새 탭 추가');
		addBtn.addEventListener('click', () => {
			void (async () => {
				const newTab: ReferenceTab = {
					id: generateTabId(),
					displayName: '새 탭',
					icon: '📁',
				};
				this.plugin.settings.reference.customTabs.push(newTab);
				this.plugin.settings.reference.items[newTab.id] = [];
				await this.plugin.saveSettings();
				this.activeTabId  = newTab.id;
				this.editingTabId = newTab.id; // 생성 즉시 편집 모드
				this.renderBoard();
			})();
		});
	}

	/** 일반 탭 칩 렌더링 */
	private renderTabChip(parent: HTMLElement, tab: ReferenceTab): void {
		const tabEl = parent.createDiv({
			cls: tab.id === this.activeTabId ? 'ref-tab ref-tab-active' : 'ref-tab',
		});

		// ── 드래그 소스 ─────────────────────────────────────────────
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

		// ── 드롭 타겟 ──────────────────────────────────────────────
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

				// 원본 제거 후 남은 배열에서 대상 위치 찾아 삽입
				const moved = tabs.splice(fromIdx, 1)[0];
				if (!moved) return;
				const newToIdx = tabs.findIndex(t => t.id === tab.id);
				tabs.splice(isBefore ? newToIdx : newToIdx + 1, 0, moved);

				await this.plugin.saveSettings();
				this.renderBoard();
			})();
		});

		// ── 클릭 / 더블클릭 ────────────────────────────────────────
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

		// 아이콘은 📁으로 통일
		tabEl.createSpan({text: `📁 ${tab.displayName}`, cls: 'ref-tab-label'});

		// hover 시 표시되는 × 삭제 버튼
		const deleteBtn = tabEl.createSpan({text: '×', cls: 'ref-tab-delete-btn'});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			new ConfirmDeleteTabModal(this.app, tab.displayName, () => { void this.deleteTab(tab.id); }).open();
		});
	}

	/** 인라인 편집 폼 (이름만 수정, 이모지 없음) */
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
					// 새 탭 취소 시 삭제
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

	/** 탭 삭제 (데이터 포함) */
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
		// 활성 탭 보정
		if (this.activeTabId === tabId) {
			this.activeTabId = tabs[0]?.id ?? '';
		}
		await this.plugin.saveSettings();
		this.renderBoard();
	}

	// ── 탭 콘텐츠 ─────────────────────────────────────────────────────

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

		// 파일 탐색기 드롭
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

	/**
	 * 드래그 이벤트에서 노트 제목 배열을 추출한다.
	 *
	 * Obsidian 파일 탐색기는 드래그 데이터를 여러 형태로 보낸다:
	 *   1) obsidian://open?vault=...&file=... URI (단일 또는 다중)
	 *   2) [[제목1]]\n[[제목2]] 형태의 위키링크 목록
	 *   3) 일반 텍스트(plain text)
	 *
	 * 단일·다중 선택 모두 개별 노트 제목 배열로 반환한다.
	 */
	private extractNoteTitlesFromDrop(e: DragEvent): string[] {
		const dt = e.dataTransfer;
		if (!dt) return [];

		const textData = dt.getData('text/plain');
		if (textData) {
			// ① obsidian:// URI를 텍스트 어디서든 전부 추출
			//    (제목 텍스트 뒤에 URI가 바로 붙는 경우도 처리)
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

			// ② [[제목]] 위키링크 패턴 (다중 선택 드래그)
			const wikiMatches = [...textData.matchAll(/\[\[([^\]]+)\]\]/g)];
			if (wikiMatches.length > 0) {
				return wikiMatches
					.map(m => (m[1] ?? '').replace(/\.md$/i, '').trim())
					.filter(Boolean);
			}

			// ③ 폴백: 줄 단위로 분리 후 URI가 아닌 텍스트만 수집
			const titles = textData.split(/\r?\n/)
				.map(line => line.trim())
				.filter(line => line && !line.startsWith('obsidian://'))
				.map(line => line.replace(/\.md$/i, '').trim())
				.filter(Boolean);
			return titles;
		}

		// Windows 탐색기에서 파일 드래그
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
}

// ═════════════════════════════════════════════════════════════════════════
// 탭 삭제 확인 모달
// ═════════════════════════════════════════════════════════════════════════

class ConfirmDeleteTabModal extends Modal {
	private tabName: string;
	private onConfirm: () => void;

	constructor(app: App, tabName: string, onConfirm: () => void) {
		super(app);
		this.tabName     = tabName;
		this.onConfirm   = onConfirm;
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
