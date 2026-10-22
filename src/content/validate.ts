// Turns the raw text of one story folder into either a LoadedStory or a list of problems naming the file.
// Order matters: parse each file, check its shape against its schema, and only then run the cross-file
// integrity checks (which assume well-shaped data). Used by the app loader and by `npm run validate`.
import { checkIntegrity } from './integrity.ts';
import type { SceneSource } from './integrity.ts';
import { describeSchemaErrors } from './schemas.ts';
import type { Validators } from './schemas.ts';
import type {
  ContentProblem, EncounterPool, Item, LoadedStory, Monster, Scene, Story,
} from './types.ts';

/** The raw files of one story folder, keyed by path inside it ("story.json", "scenes/chapter-1.json"). */
export interface RawStory {
  folder: string;
  files: Record<string, string>;
}

export interface ValidationResult {
  problems: ContentProblem[];
  loaded: LoadedStory | null;
}

const REQUIRED = ['story.json', 'monsters.json', 'items.json', 'encounters.json'] as const;

export function validateStory(raw: RawStory, validators: Validators): ValidationResult {
  const problems: ContentProblem[] = [];
  const pathOf = (name: string): string => `stories/${raw.folder}/${name}`;

  const parse = (name: string, validate: (typeof validators)[keyof Validators]): unknown => {
    const text = raw.files[name];
    if (text === undefined) return undefined;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      problems.push({ file: pathOf(name), where: '(file)', message: `isn't valid JSON: ${error instanceof Error ? error.message : String(error)}` });
      return undefined;
    }
    if (!validate(data)) {
      for (const line of describeSchemaErrors(validate.errors)) problems.push({ file: pathOf(name), ...line });
      return undefined;
    }
    return data;
  };

  for (const name of REQUIRED) {
    if (raw.files[name] === undefined) problems.push({ file: pathOf(name), where: '(file)', message: 'this file is missing' });
  }
  const sceneFiles = Object.keys(raw.files).filter((name) => name.startsWith('scenes/') && name.endsWith('.json')).sort();
  if (sceneFiles.length === 0) problems.push({ file: pathOf('scenes/'), where: '(folder)', message: 'no scene files found' });

  const story = parse('story.json', validators.story) as Story | undefined;
  const monsterFile = parse('monsters.json', validators.monsters) as { monsters: Monster[] } | undefined;
  const itemFile = parse('items.json', validators.items) as { items: Item[] } | undefined;
  const encounterFile = parse('encounters.json', validators.encounters) as { pools: EncounterPool[] } | undefined;

  const sources: SceneSource[] = [];
  for (const name of sceneFiles) {
    const data = parse(name, validators.scenes) as { scenes: Scene[] } | undefined;
    data?.scenes.forEach((scene, index) => sources.push({ scene, file: pathOf(name), index }));
  }

  if (story && story.id !== raw.folder) {
    problems.push({ file: pathOf('story.json'), where: 'id', message: `the id "${story.id}" must match the folder name "${raw.folder}"` });
  }
  if (problems.length > 0 || !story || !monsterFile || !itemFile || !encounterFile) return { problems, loaded: null };

  problems.push(
    ...checkIntegrity({
      story,
      scenes: sources,
      monsters: monsterFile.monsters,
      items: itemFile.items,
      pools: encounterFile.pools,
      paths: { story: pathOf('story.json'), monsters: pathOf('monsters.json'), items: pathOf('items.json'), encounters: pathOf('encounters.json') },
    }),
  );
  if (problems.length > 0) return { problems, loaded: null };

  return {
    problems,
    loaded: {
      story,
      scenes: new Map(sources.map((s) => [s.scene.id, s.scene])),
      monsters: new Map(monsterFile.monsters.map((m) => [m.id, m])),
      items: new Map(itemFile.items.map((i) => [i.id, i])),
      pools: new Map(encounterFile.pools.map((p) => [p.chapterId, p.entries])),
    },
  };
}
