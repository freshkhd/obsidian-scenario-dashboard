export interface KanbanItem {
	noteTitle: string;
	addedAt: number;
	children?: KanbanItem[];
}

export type ColumnId = 'ideas' | 'step-outline' | 'plot-development' | 'treatment' | 'project';

// ── 멀티 뷰 ──────────────────────────────────────────────────────────────
export type DashboardViewKind = 'story' | 'gantt' | 'character';

// ── 간트 차트 ─────────────────────────────────────────────────────────────

export type GanttTaskStatus = 'planned' | 'in-progress' | 'done';

export interface GanttTask {
	id: string;
	title: string;
	startDate: string;   // 'YYYY-MM-DD'
	endDate: string;     // 'YYYY-MM-DD' (inclusive)
	progress: number;    // 0..100
	status: GanttTaskStatus;
}

export type GanttAccent = 'tertiary' | 'secondary' | 'muted';

export interface GanttPhase {
	id: string;
	displayName: string;
	accent: GanttAccent;
}

export interface GanttData {
	phases: GanttPhase[];
	tasks: Record<string, GanttTask[]>;  // key = GanttPhase.id
}

export interface KanbanData {
	columns: Record<ColumnId, KanbanItem[]>;
}

export interface ColumnDef {
	id: ColumnId;
	emoji: string;       // fixed emoji prefix (not editable by user)
	displayName: string; // default text label (editable by user)
	placeholder: string;
}

// ── 참고자료 패널 (동적 탭) ────────────────────────────────────

/** 사용자가 자유롭게 추가·수정·삭제하는 탭 하나 */
export interface ReferenceTab {
	id: string;          // 고유 식별자 (timestamp base36)
	displayName: string;
	icon: string;        // 이모지 1개
}

/** 참고자료 전체 데이터 */
export interface ReferenceData {
	customTabs: ReferenceTab[];
	items: Record<string, KanbanItem[]>; // key = ReferenceTab.id
}

// ── Character 뷰 ──────────────────────────────────────────────────

export type CharacterRole = 'protagonist' | 'mentor' | 'rival' | 'supporting';

/** 오른쪽 패널에 등록된 캐릭터 한 명 */
export interface CharacterEntry {
	id: string;
	noteTitle: string;  // 동명 Obsidian 노트가 있으면 openLinkText로 연결됨
	role: CharacterRole;
	addedAt: number;
}

/** 캔버스 위에 배치된 캐릭터 노드 인스턴스 */
export interface CharacterNode {
	characterId: string;  // CharacterEntry.id 참조
	x: number;
	y: number;
}

/** 프로젝트 1개 */
export interface CharacterProject {
	id: string;
	name: string;
	characters: CharacterEntry[];
	nodes: CharacterNode[];
}

export interface CharacterData {
	projects: CharacterProject[];
	activeProjectId: string;
}
