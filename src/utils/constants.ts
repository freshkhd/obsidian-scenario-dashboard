import {ColumnDef, ColumnId, KanbanData, ReferenceData, ReferenceTab} from '../types';

export const VIEW_TYPE_KANBAN = 'scenario-kanban-dashboard';

export const COLUMN_DEFS: ColumnDef[] = [
	{id: 'ideas',           emoji: '💡', displayName: 'Ideas',            placeholder: 'Search notes to add...'},
	{id: 'plot-development', emoji: '🗺️', displayName: 'Plot Development', placeholder: 'Search notes to add...'},
	{id: 'project',          emoji: '🎬', displayName: 'Project',           placeholder: 'Search notes to add...'},
];

/** Default text labels for each pipeline column (emoji excluded) */
export const DEFAULT_COLUMN_NAMES: Record<ColumnId, string> = {
	'ideas':            'Ideas',
	'plot-development': 'Plot Development',
	'project':          'Project',
};

/** Fixed emoji for the reference panel title */
export const DEFAULT_REF_PANEL_EMOJI = '📋';
/** Default text for the reference panel title (emoji excluded) */
export const DEFAULT_REF_PANEL_TITLE = 'References';

export const DEFAULT_KANBAN_DATA: KanbanData = {
	columns: {
		'ideas': [],
		'plot-development': [],
		'project': [],
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
