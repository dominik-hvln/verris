import * as migration_20260708_155402_initial from './20260708_155402_initial';
import * as migration_20260709_090000_posts_meta from './20260709_090000_posts_meta';
import * as migration_20260709_120000_posts_faq from './20260709_120000_posts_faq';

export const migrations = [
  {
    up: migration_20260708_155402_initial.up,
    down: migration_20260708_155402_initial.down,
    name: '20260708_155402_initial',
  },
  {
    up: migration_20260709_090000_posts_meta.up,
    down: migration_20260709_090000_posts_meta.down,
    name: '20260709_090000_posts_meta',
  },
  {
    up: migration_20260709_120000_posts_faq.up,
    down: migration_20260709_120000_posts_faq.down,
    name: '20260709_120000_posts_faq',
  },
];
