import ts from "typescript";

const MAX_RESOLUTION_DEPTH = 16;

function isScopeBoundary(node, root) {
  return (
    node !== root &&
    (ts.isBlock(node) ||
      ts.isCatchClause(node) ||
      ts.isFunctionLike(node) ||
      ts.isModuleBlock(node))
  );
}

function addUnsafePattern(scope, name) {
  if (ts.isIdentifier(name)) {
    scope.bindings.set(name.text, { mutable: true });
    return;
  }
  for (const element of name.elements ?? []) {
    if (ts.isBindingElement(element)) addUnsafePattern(scope, element.name);
  }
}

function buildScopes(file) {
  const scopes = new WeakMap();
  const root = { bindings: new Map(), parent: undefined };
  function visit(node, scope) {
    const current = isScopeBoundary(node, file) ? { bindings: new Map(), parent: scope } : scope;
    scopes.set(node, current);
    if (ts.isVariableDeclaration(node)) {
      const declarations = node.parent;
      const constant =
        ts.isVariableDeclarationList(declarations) &&
        (declarations.flags & ts.NodeFlags.Const) !== 0;
      if (constant && ts.isIdentifier(node.name))
        current.bindings.set(node.name.text, {
          initializer: node.initializer,
          mutable: false,
          scope: current,
        });
      else addUnsafePattern(current, node.name);
    }
    if (ts.isParameter(node)) addUnsafePattern(current, node.name);
    if (ts.isCatchClause(node) && node.variableDeclaration)
      addUnsafePattern(current, node.variableDeclaration.name);
    ts.forEachChild(node, (child) => visit(child, current));
  }
  visit(file, root);
  return { root, scopes };
}

function findBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
  }
  return undefined;
}

function mutationRoot(node) {
  if (ts.isIdentifier(node)) return node;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return mutationRoot(node.expression);
  return undefined;
}

function markMutations(file, scopes) {
  function mark(node) {
    const root = mutationRoot(node);
    const scope = scopes.get(node);
    if (!root || !scope) return;
    const binding = findBinding(scope, root.text);
    if (binding) binding.mutable = true;
  }
  function visit(node) {
    if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind))
      mark(node.left);
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    )
      mark(node.operand);
    ts.forEachChild(node, visit);
  }
  visit(file);
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
}

function resolveLogRequest(expression, scope, context = { depth: 0, resolving: new Set() }) {
  if (context.depth > MAX_RESOLUTION_DEPTH) return undefined;
  if (ts.isIdentifier(expression)) {
    const binding = findBinding(scope, expression.text);
    if (!binding || binding.mutable || !binding.initializer || context.resolving.has(binding))
      return undefined;
    context.resolving.add(binding);
    const resolved = resolveLogRequest(binding.initializer, binding.scope, {
      depth: context.depth + 1,
      resolving: context.resolving,
    });
    context.resolving.delete(binding);
    return resolved;
  }
  if (!ts.isObjectLiteralExpression(expression)) return undefined;
  const properties = new Set();
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = resolveLogRequest(property.expression, scope, {
        depth: context.depth + 1,
        resolving: context.resolving,
      });
      if (!spread) return undefined;
      for (const name of spread) properties.add(name);
      continue;
    }
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = propertyName(property.name);
      if (!name) return undefined;
      properties.add(name);
      continue;
    }
    return undefined;
  }
  return properties;
}

export function createLogRequestScopeResolver(file) {
  const { root, scopes } = buildScopes(file);
  markMutations(file, scopes);
  return (argument, node) => {
    const properties = resolveLogRequest(argument, scopes.get(node) ?? root);
    return properties?.has("fromBlock") === true && properties.has("toBlock") === true;
  };
}
