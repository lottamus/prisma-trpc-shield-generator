import { EnvValue, GeneratorOptions } from '@prisma/generator-helper';
import { parseEnvValue } from '@prisma/internals';
import { Config } from './config';
import getRelativePath from './utils/getRelativePath';

export const getImports = (
  type: 'trpc' | 'trpc-shield' | 'context',
  newPath?: string,
) => {
  let statement = '';
  if (type === 'trpc') {
    statement = "import * as trpc from '@trpc/server';\n";
  } else if (type === 'trpc-shield') {
    statement =
      "import { shield as trpcShield, allow } from 'trpc-shield';\nimport { IOptions, IRuleFieldMap, IRules, ShieldRule } from 'trpc-shield/lib/types';\n";
  } else if (type === 'context') {
    statement = `import { Context } from '${newPath}';\n`;
  }

  return statement;
};

export const wrapWithObject = ({
  shieldItemLines,
}: {
  shieldItemLines: Array<string> | string;
}) => {
  let wrapped = '{';
  wrapped += '\n';
  wrapped += Array.isArray(shieldItemLines)
    ? '  ' + shieldItemLines.join(',\r\n')
    : '  ' + shieldItemLines;
  wrapped += '\n';
  wrapped += '}';
  return wrapped;
};

export const wrapWithTrpcShieldCall = ({
  shieldObjectTextWrapped,
}: {
  shieldObjectTextWrapped: string;
}) => {
  let wrapped = 'shield<Context>(';
  wrapped += '\n';
  wrapped += '  ' + shieldObjectTextWrapped;
  wrapped += '\n';
  wrapped += ')';
  return wrapped;
};

export const wrapWithExport = ({
  shieldObjectText,
}: {
  shieldObjectText: string;
}) => {
  return `export const permissions = ${shieldObjectText};`;
};

export const constructShield = (
  {
    queries,
    mutations,
    subscriptions,
  }: {
    queries: Array<string>;
    mutations: Array<string>;
    subscriptions: Array<string>;
  },
  config: Config,
  options: GeneratorOptions,
) => {
  if (
    queries.length === 0 &&
    mutations.length === 0 &&
    subscriptions.length === 0
  ) {
    return '';
  }

  let rootItems = '';
  let rootTypes = '';
  if (queries.length > 0) {
    const queryLinesWrapped = `query: ${wrapWithObject({
      shieldItemLines: queries.map((query) => `${query}: allow`),
    })},`;

    rootItems += queryLinesWrapped;
    rootTypes += `export type QueryKeys = ${queries
      .map((query) => `'${query}'`)
      .join(' | ')};\n`;
  }
  if (mutations.length > 0) {
    const mutationLinesWrapped = `mutation: ${wrapWithObject({
      shieldItemLines: mutations.map((mutation) => `${mutation}: allow`),
    })},`;
    rootItems += mutationLinesWrapped;
    rootTypes += `export type MutationKeys = ${mutations
      .map((mutation) => `'${mutation}'`)
      .join(' | ')};\n`;
  }

  if (subscriptions.length > 0) {
    const subscriptionLinesWrapped = `subscription: ${wrapWithObject({
      shieldItemLines: subscriptions.map(
        (subscription) => `${subscription}: allow`,
      ),
    })},`;
    rootItems += subscriptionLinesWrapped;
    rootTypes += `export type SubscriptionKeys = ${subscriptions
      .map((subscription) => `'${subscription}'`)
      .join(' | ')};\n`;
  }

  if (rootItems.length === 0) return '';
  let shieldText = getImports('trpc-shield');
  const outputDir = parseEnvValue(options.generator.output as EnvValue);

  shieldText += getImports(
    'context',
    getRelativePath(outputDir, config.contextPath, options.schemaPath),
  );
  shieldText += '\n\n';
  shieldText += wrapWithExport({
    shieldObjectText: wrapWithTrpcShieldCall({
      shieldObjectTextWrapped: wrapWithObject({ shieldItemLines: rootItems }),
    }),
  });

  shieldText += `

  export function shield<TContext extends Record<string, any>>(ruleTree: RuleTree<TContext>, options?: IOptions<TContext>) {
    return trpcShield(ruleTree as IRules<TContext>, options);
  }

  export type RuleTypeMap<TContext, IRuleKeys extends string> = {
    [K in IRuleKeys]?: ShieldRule<TContext> | IRuleFieldMap<TContext>
  };

  ${rootTypes}

  export type RuleTree<TContext> = {
    ${
      queries.length
        ? 'query?: ShieldRule<TContext> | RuleTypeMap<TContext, QueryKeys>;'
        : ''
    }
    ${
      mutations.length
        ? 'mutation?: ShieldRule<TContext> | RuleTypeMap<TContext, MutationKeys>;'
        : ''
    }
    ${
      subscriptions.length
        ? 'subscription?: ShieldRule<TContext> | RuleTypeMap<TContext, SubscriptionKeys>;'
        : ''
    }
  };`;

  return shieldText;
};
