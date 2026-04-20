'use strict';

// Compose Diff Engine — v6.6 Remediation Wizard
//
// Uses `yaml` package (preserves comments/style, round-trip-safe per preflight A1).
// Patches use: null = delete key, {$remove: [...]} = list surgery, {$add: [...]} = list append,
// nested objects = recursive merge, scalars = replace.

const fs = require('fs');
const YAML = require('yaml');
const Diff = require('diff');

/**
 * Apply a patch object to a yaml Node (mutating).
 * @param {YAML.Node} node - target parent node (usually service block)
 * @param {object} patch - patch to apply
 */
function applyPatch(node, patch) {
  if (!node || !patch) return;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      // Deletion
      if (node.has && node.has(key)) node.delete(key);
    } else if (value && typeof value === 'object' && !Array.isArray(value) && '$remove' in value) {
      // List surgery — remove items
      const list = node.get(key, true);
      if (list && YAML.isSeq(list)) {
        for (let i = list.items.length - 1; i >= 0; i--) {
          const item = list.items[i];
          const str = YAML.isScalar(item) ? String(item.value) : String(item);
          if (value.$remove.includes(str)) list.items.splice(i, 1);
        }
        if (list.items.length === 0 && node.has(key)) node.delete(key);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value) && '$add' in value) {
      // List surgery — add items
      let list = node.get(key, true);
      if (!list || !YAML.isSeq(list)) {
        list = new YAML.YAMLSeq();
        node.set(key, list);
      }
      for (const item of value.$add) {
        const existing = list.items.some(i =>
          (YAML.isScalar(i) ? String(i.value) : String(i)) === String(item)
        );
        if (!existing) list.add(item);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Nested merge
      if (!node.has || !node.has(key)) {
        node.set(key, value);
      } else {
        const child = node.get(key, true);
        if (child && (YAML.isMap(child) || YAML.isSeq(child))) {
          applyPatch(child, value);
        } else {
          // Scalar → replaced with nested object; set directly
          node.set(key, value);
        }
      }
    } else {
      // Scalar or array replacement
      node.set(key, value);
    }
  }
}

/**
 * Parse a compose file, apply patches per service, return before/after/diff.
 * @param {string} filePath - absolute path to compose file
 * @param {Object.<string, object>} patchesByService - { serviceName: patch }
 * @returns {{before: string, after: string, unified: string}}
 */
function diffComposeFile(filePath, patchesByService) {
  const before = fs.readFileSync(filePath, 'utf8');
  const doc = YAML.parseDocument(before, { keepSourceTokens: true });

  for (const [service, patch] of Object.entries(patchesByService)) {
    const serviceNode = doc.getIn(['services', service], true);
    if (!serviceNode) {
      throw new Error(`Service '${service}' not found in ${filePath}`);
    }
    applyPatch(serviceNode, patch);
  }

  const after = String(doc);
  const unified = Diff.createPatch(filePath, before, after, '', '');
  return { before, after, unified };
}

/**
 * Compute a diff between two YAML strings (no file I/O).
 * Useful for previewing patches without touching disk.
 */
function diffYamlStrings(beforeYaml, patchesByService, filenameHint = 'docker-compose.yml') {
  const doc = YAML.parseDocument(beforeYaml, { keepSourceTokens: true });
  for (const [service, patch] of Object.entries(patchesByService)) {
    const serviceNode = doc.getIn(['services', service], true);
    if (!serviceNode) throw new Error(`Service '${service}' not found`);
    applyPatch(serviceNode, patch);
  }
  const after = String(doc);
  const unified = Diff.createPatch(filenameHint, beforeYaml, after, '', '');
  return { before: beforeYaml, after, unified };
}

module.exports = { applyPatch, diffComposeFile, diffYamlStrings };
