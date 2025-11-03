import templatesJson from "./templates.json";
import answerSetsJson from "./answerSets.json";
import mappingJson from "./mapping.json";

export type Direction = "mendatar" | "menurun";

export interface TemplateWord {
  no: number;
  arah: Direction;
  start: [number, number];
  length: number;
}

export interface Template {
  id: string;
  name: string;
  gridSize: [number, number];
  words: TemplateWord[];
}

export interface AnswerWord {
  no: number;
  jawaban: string;
}

export interface AnswerSet {
  id: string;
  template_id: string;
  title: string;
  words: AnswerWord[];
}

export interface MappingEntry {
  date: string;
  template_id: string;
  jawaban_id: string;
}

const cloneTemplateWord = (word: TemplateWord): TemplateWord => ({
  ...word,
  start: [...word.start] as [number, number],
});

export const templates: Template[] = (templatesJson as Template[]).map((template) => ({
  ...template,
  gridSize: [...template.gridSize] as [number, number],
  words: template.words.map(cloneTemplateWord),
}));

export const answerSets: AnswerSet[] = (answerSetsJson as AnswerSet[]).map((answerSet) => ({
  ...answerSet,
  words: answerSet.words.map((word) => ({ ...word })),
}));

export const mappingEntries: MappingEntry[] = (mappingJson as MappingEntry[]).map((entry) => ({
  ...entry,
}));

export const getMappingForDate = (date: string): MappingEntry | undefined =>
  mappingEntries.find((entry) => entry.date === date);

export const getTemplateById = (id: string): Template | undefined =>
  templates.find((template) => template.id === id);

export const getAnswerSetById = (id: string): AnswerSet | undefined =>
  answerSets.find((answerSet) => answerSet.id === id);
