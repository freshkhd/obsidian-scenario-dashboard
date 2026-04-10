import {ColumnDef, KanbanData, ReferenceData, ReferenceTab} from '../types';

export const VIEW_TYPE_KANBAN = 'scenario-kanban-dashboard';

export const COLUMN_DEFS: ColumnDef[] = [
	{id: 'ideas', displayName: '💡 아이디어', placeholder: '[[노트 제목]] 입력 후 Enter'},
	{id: 'plot-development', displayName: '🗺️ 플롯 개발', placeholder: '[[노트 제목]] 입력 후 Enter'},
	{id: 'project', displayName: '🎬 프로젝트', placeholder: '[[노트 제목]] 입력 후 Enter'},
];

export const DEFAULT_KANBAN_DATA: KanbanData = {
	columns: {
		'ideas': [],
		'plot-development': [],
		'project': [],
	},
};

/** 최초 실행 시 기본으로 생성되는 탭 목록 */
export const DEFAULT_REFERENCE_TABS: ReferenceTab[] = [
	{id: 'characters',   displayName: '캐릭터',     icon: '📁'},
	{id: 'settings',     displayName: '설정',        icon: '📁'},
	{id: 'story-beats',  displayName: '스토리 비트', icon: '📁'},
	{id: 'scenes',       displayName: '장면',        icon: '📁'},
	{id: 'dialogues',    displayName: '대사',         icon: '📁'},
];

export const DEFAULT_REFERENCE_DATA: ReferenceData = {
	customTabs: DEFAULT_REFERENCE_TABS.map(t => ({...t})),
	items: Object.fromEntries(DEFAULT_REFERENCE_TABS.map(t => [t.id, []])),
};
