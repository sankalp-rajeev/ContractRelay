import { readFile, writeFile } from 'node:fs/promises';
import { codegen } from '@graphql-codegen/core';
import { parse, buildSchema, printSchema } from 'graphql';
import * as operations from '@graphql-codegen/typescript-operations';
import * as document from '@graphql-codegen/typed-document-node';

const filename = 'src/generated/graphql.ts';
const schema = buildSchema(await readFile('src/graphql/schema.graphql', 'utf8'));
const output = await codegen({
  filename,
  schema: parse(printSchema(schema)),
  documents: [
    {
      location: 'src/graphql/queries.graphql',
      document: parse(await readFile('src/graphql/queries.graphql', 'utf8')),
    },
  ],
  plugins: [{ operations: {} }, { document: {} }],
  pluginMap: { operations, document },
  config: {
    useTypeImports: true,
    enumsAsTypes: true,
    strictScalars: true,
    scalars: {
      JSON: {
        input: "import('../server/artifacts').Json",
        output: "import('../server/artifacts').Json",
      },
    },
  },
});
await writeFile(filename, output.replaceAll('\r\n', '\n'));
console.log(`Generated ${filename} from the inspection schema and queries.`);
