import {KanbanData, ReferenceData} from './types';
import {DEFAULT_KANBAN_DATA, DEFAULT_REFERENCE_DATA} from './utils/constants';

export interface ScenarioPluginSettings {
	kanban: KanbanData;
	reference: ReferenceData;
}

export const DEFAULT_SETTINGS: ScenarioPluginSettings = {
	kanban: DEFAULT_KANBAN_DATA,
	reference: DEFAULT_REFERENCE_DATA,
};
