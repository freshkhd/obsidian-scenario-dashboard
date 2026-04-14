import {CharacterData, ColumnId, DashboardViewKind, GanttData, KanbanData, ReferenceData} from './types';
import {DEFAULT_CHARACTER_DATA, DEFAULT_COLUMN_NAMES, DEFAULT_GANTT_DATA, DEFAULT_GANTT_SCALE, DEFAULT_KANBAN_DATA, DEFAULT_LAST_VIEW, DEFAULT_REFERENCE_DATA, DEFAULT_REF_PANEL_TITLE} from './utils/constants';

export interface ScenarioPluginSettings {
	kanban: KanbanData;
	reference: ReferenceData;
	/** User-editable display name for each pipeline column */
	columnNames: Record<ColumnId, string>;
	/** User-editable title for the reference panel header */
	refPanelTitle: string;
	/** Gantt chart data */
	gantt: GanttData;
	/** Last active dashboard view */
	lastActiveView: DashboardViewKind;
	/** Gantt timeline scale */
	ganttScale: 'daily' | 'weekly' | 'monthly';
	/** Character view data */
	character: CharacterData;
}

export const DEFAULT_SETTINGS: ScenarioPluginSettings = {
	kanban:         DEFAULT_KANBAN_DATA,
	reference:      DEFAULT_REFERENCE_DATA,
	columnNames:    {...DEFAULT_COLUMN_NAMES},
	refPanelTitle:  DEFAULT_REF_PANEL_TITLE,
	gantt:          DEFAULT_GANTT_DATA,
	lastActiveView: DEFAULT_LAST_VIEW,
	ganttScale:     DEFAULT_GANTT_SCALE,
	character:      DEFAULT_CHARACTER_DATA,
};
