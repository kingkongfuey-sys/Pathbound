// The app's door to story content. Story folders are bundled with the app but read lazily, as raw text, so a
// broken file can be reported by name (a bundler would fail the whole build, or hide the problem). Every story is
// run through the same schema and integrity checks as `npm run validate` before the engine ever sees it.
import { createValidators } from './schemas.ts';
import type { SchemaFiles, Validators } from './schemas.ts';
import { validateStory } from './validate.ts';
import type { RawStory } from './validate.ts';
import type { ContentProblem, LoadedStory, Story } from './types.ts';

const schemaModules = import.meta.glob('../../content/schema/*.json', { eager: true, import: 'default' }) as SchemaFiles;
const storyFiles = import.meta.glob('/content/stories/**/*.json', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

let validators: Validators | null = null;
function getValidators(): Validators {
  validators ??= createValidators(schemaModules);
  return validators;
}

/** Thrown when a story's files don't pass the checks; carries every problem found. */
export class ContentError extends Error {
  readonly problems: ContentProblem[];
  constructor(problems: ContentProblem[]) {
    super(`Story content has ${problems.length} problem(s).`);
    this.problems = problems;
  }
}

const PREFIX = '/content/stories/';

function folderNames(): string[] {
  const names = new Set<string>();
  for (const path of Object.keys(storyFiles)) {
    const folder = path.slice(PREFIX.length).split('/')[0];
    if (folder) names.add(folder);
  }
  return [...names].sort();
}

async function readFolder(folder: string, only?: string): Promise<RawStory> {
  const files: Record<string, string> = {};
  const wanted = Object.entries(storyFiles).filter(([path]) => {
    if (!path.startsWith(`${PREFIX}${folder}/`)) return false;
    return only === undefined || path === `${PREFIX}${folder}/${only}`;
  });
  await Promise.all(
    wanted.map(async ([path, load]) => {
      files[path.slice(`${PREFIX}${folder}/`.length)] = await load();
    }),
  );
  return { folder, files };
}

export interface StoryListing {
  folder: string;
  title: string;
  blurb: string;
  rating: Story['rating'] | null;
  toneLine: string;
  damaged: boolean;
}

/** One entry per story folder, built from story.json alone so the shelf opens quickly. */
export async function listStories(): Promise<StoryListing[]> {
  const check = getValidators();
  return Promise.all(
    folderNames().map(async (folder): Promise<StoryListing> => {
      const raw = await readFolder(folder, 'story.json');
      const text = raw.files['story.json'];
      try {
        const data: unknown = JSON.parse(text ?? '');
        if (check.story(data)) {
          const s = data as Story;
          return { folder, title: s.title, blurb: s.blurb, rating: s.rating, toneLine: s.toneLine, damaged: false };
        }
      } catch {
        // fall through to the damaged listing; the details appear when the story is opened
      }
      return { folder, title: folder, blurb: '', rating: null, toneLine: '', damaged: true };
    }),
  );
}

const cache = new Map<string, LoadedStory>();

/** Read, validate and index one story. Throws ContentError naming every file and place that is wrong. */
export async function loadStory(folder: string): Promise<LoadedStory> {
  const cached = cache.get(folder);
  if (cached) return cached;
  const { problems, loaded } = validateStory(await readFolder(folder), getValidators());
  if (!loaded) throw new ContentError(problems);
  cache.set(folder, loaded);
  return loaded;
}
