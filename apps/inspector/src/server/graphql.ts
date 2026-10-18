import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSchema, execute, parse, validate, GraphQLError } from 'graphql';
import type { ExecutionResult, GraphQLScalarType } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { artifacts, ArtifactError } from './artifacts';
import type { ArtifactService } from './artifacts';
import { z } from 'zod';

export const schema = buildSchema(
  readFileSync(resolve(process.cwd(), 'src/graphql/schema.graphql'), 'utf8'),
);
const jsonScalar = schema.getType('JSON') as GraphQLScalarType;
jsonScalar.serialize = (value) => z.json().parse(value);
jsonScalar.parseValue = (value) => z.json().parse(value);

export const rootFor = (service: ArtifactService) => ({
  migrations: () => service.migrations(),
  migration: ({ id, trial }: { id: string; trial?: number }) => service.migration(id, trial),
  benchmarkSummary: () => service.benchmarkSummary(),
  realWorldResults: () => service.realWorldResults(),
});

function publicError(error: GraphQLError) {
  const original = error.originalError;
  if (original instanceof ArtifactError)
    return new GraphQLError(original.message, {
      path: error.path,
      extensions: { code: original.code },
    });
  return new GraphQLError('Artifact query could not be completed.', {
    path: error.path,
    extensions: { code: 'QUERY_FAILED' },
  });
}

export async function query<T, V extends Record<string, unknown>>(
  document: TypedDocumentNode<T, V>,
  variables: V,
  service = artifacts,
): Promise<T> {
  const result = await execute({
    schema,
    document,
    rootValue: rootFor(service),
    variableValues: variables,
  });
  if (result.errors?.length) throw publicError(result.errors[0]);
  // GraphQL creates null-prototype result objects; React Server Components require
  // ordinary serializable objects at a client boundary (the HTTP API normalizes too).
  return structuredClone(result.data) as T;
}

export async function executeRequest(
  source: string,
  variables?: Record<string, unknown>,
  operationName?: string,
  service = artifacts,
): Promise<ExecutionResult> {
  let document;
  try {
    document = parse(source);
  } catch {
    return {
      errors: [
        new GraphQLError('Invalid GraphQL syntax.', { extensions: { code: 'BAD_REQUEST' } }),
      ],
    };
  }
  const errors = validate(schema, document);
  if (errors.length) return { errors };
  const result = await execute({
    schema,
    document,
    rootValue: rootFor(service),
    variableValues: variables,
    operationName,
  });
  return { ...result, errors: result.errors?.map(publicError) };
}
