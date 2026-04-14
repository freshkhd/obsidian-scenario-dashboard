import {CharacterData, CharacterRole, ColumnDef, ColumnId, DashboardViewKind, GanttData, GanttPhase, KanbanData, ReferenceData, ReferenceTab} from '../types';

export const VIEW_TYPE_KANBAN = 'scenario-kanban-dashboard';

export const COLUMN_DEFS: ColumnDef[] = [
	{id: 'ideas',            emoji: '💡', displayName: 'Ideas',         placeholder: '[[Note Title]] or plain text + Enter'},
	{id: 'step-outline',     emoji: '📝', displayName: 'Step Outline',  placeholder: '[[Note Title]] or plain text + Enter'},
	{id: 'plot-development', emoji: '🗺️', displayName: 'Plot',          placeholder: '[[Note Title]] or plain text + Enter'},
	{id: 'treatment',        emoji: '📄', displayName: 'Treatment',     placeholder: '[[Note Title]] or plain text + Enter'},
	{id: 'project',          emoji: '🎬', displayName: 'Scenario',      placeholder: '[[Note Title]] or plain text + Enter'},
];

/** Default text labels for each pipeline column (emoji excluded) */
export const DEFAULT_COLUMN_NAMES: Record<ColumnId, string> = {
	'ideas':            'Ideas',
	'step-outline':     'Step Outline',
	'plot-development': 'Plot',
	'treatment':        'Treatment',
	'project':          'Scenario',
};

/** Fixed emoji for the reference panel title */
export const DEFAULT_REF_PANEL_EMOJI = '📋';
/** Default text for the reference panel title (emoji excluded) */
export const DEFAULT_REF_PANEL_TITLE = 'References';

export const DEFAULT_KANBAN_DATA: KanbanData = {
	columns: {
		'ideas':            [],
		'step-outline':     [],
		'plot-development': [],
		'treatment':        [],
		'project':          [],
	},
};

/** Default tabs created on first launch */
export const DEFAULT_REFERENCE_TABS: ReferenceTab[] = [
	{id: 'characters',  displayName: 'Characters',  icon: '📁'},
	{id: 'settings',    displayName: 'World',        icon: '📁'},
	{id: 'story-beats', displayName: 'Story Beats',  icon: '📁'},
	{id: 'scenes',      displayName: 'Scenes',       icon: '📁'},
	{id: 'dialogues',   displayName: 'Dialogue',     icon: '📁'},
];

export const DEFAULT_REFERENCE_DATA: ReferenceData = {
	customTabs: DEFAULT_REFERENCE_TABS.map(t => ({...t})),
	items: Object.fromEntries(DEFAULT_REFERENCE_TABS.map(t => [t.id, []])),
};

// ── 간트 차트 ─────────────────────────────────────────────────────────────

export const DEFAULT_GANTT_PHASES: GanttPhase[] = [
	{id: 'pre-production',  displayName: 'Pre-Production',  accent: 'tertiary'},
	{id: 'production',      displayName: 'Production',      accent: 'secondary'},
	{id: 'post-production', displayName: 'Post-Production', accent: 'muted'},
];

export const DEFAULT_GANTT_DATA: GanttData = {
	phases: DEFAULT_GANTT_PHASES.map(p => ({...p})),
	tasks: Object.fromEntries(DEFAULT_GANTT_PHASES.map(p => [p.id, []])),
};

/** 하루당 픽셀 수 (스케일별) */
export const GANTT_SCALE_PX: Record<'daily' | 'weekly' | 'monthly', number> = {
	daily:   48,
	weekly:  14,
	monthly:  4,
};

export const DEFAULT_GANTT_SCALE: 'daily' | 'weekly' | 'monthly' = 'weekly';

export const DEFAULT_LAST_VIEW: DashboardViewKind = 'story';

// ── Character 뷰 ──────────────────────────────────────────────────────────

export const CHARACTER_ROLE_DEFS: Array<{id: CharacterRole; label: string}> = [
	{id: 'protagonist', label: 'Protagonist'},
	{id: 'mentor',      label: 'Mentor'},
	{id: 'rival',       label: 'Rival'},
	{id: 'supporting',  label: 'Supporting'},
];

export const DEFAULT_CHARACTER_DATA: CharacterData = {
	projects:        [],
	activeProjectId: '',
};
