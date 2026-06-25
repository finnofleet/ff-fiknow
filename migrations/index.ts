import * as migration_20260515_185825_initial_content_model from './20260515_185825_initial_content_model';
import * as migration_20260515_202651_add_users_external_id from './20260515_202651_add_users_external_id';
import * as migration_20260516_111846_add_course_prerequisites from './20260516_111846_add_course_prerequisites';
import * as migration_20260609_200155_add_course_version from './20260609_200155_add_course_version';
import * as migration_20260611_231500_add_course_tutor_enabled from './20260611_231500_add_course_tutor_enabled';
import * as migration_20260618_201224_add_learning_paths from './20260618_201224_add_learning_paths';
import * as migration_20260618_215117_add_learning_paths_drafts from './20260618_215117_add_learning_paths_drafts';

export const migrations = [
  {
    up: migration_20260515_185825_initial_content_model.up,
    down: migration_20260515_185825_initial_content_model.down,
    name: '20260515_185825_initial_content_model',
  },
  {
    up: migration_20260515_202651_add_users_external_id.up,
    down: migration_20260515_202651_add_users_external_id.down,
    name: '20260515_202651_add_users_external_id',
  },
  {
    up: migration_20260516_111846_add_course_prerequisites.up,
    down: migration_20260516_111846_add_course_prerequisites.down,
    name: '20260516_111846_add_course_prerequisites',
  },
  {
    up: migration_20260609_200155_add_course_version.up,
    down: migration_20260609_200155_add_course_version.down,
    name: '20260609_200155_add_course_version',
  },
  {
    up: migration_20260611_231500_add_course_tutor_enabled.up,
    down: migration_20260611_231500_add_course_tutor_enabled.down,
    name: '20260611_231500_add_course_tutor_enabled',
  },
  {
    up: migration_20260618_201224_add_learning_paths.up,
    down: migration_20260618_201224_add_learning_paths.down,
    name: '20260618_201224_add_learning_paths',
  },
  {
    up: migration_20260618_215117_add_learning_paths_drafts.up,
    down: migration_20260618_215117_add_learning_paths_drafts.down,
    name: '20260618_215117_add_learning_paths_drafts'
  },
];
