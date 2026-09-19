import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads connection details here rather than from the schema. The
 * runtime client gets its connection from the validated app config (see
 * src/infra/prisma); this file exists for the migration CLI.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
