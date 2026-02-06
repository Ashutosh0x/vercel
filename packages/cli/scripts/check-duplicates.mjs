#!/usr/bin/env node
/**
 * Checks for duplicate dependencies in the bundle and traces their import chains.
 * Run after build: node scripts/check-duplicates.mjs
 *
 * Options:
 *   --fail          Exit with code 1 if duplicates found (for CI)
 *   --threshold=N   Only fail if total duplicate KB exceeds N (default: 100)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const cliRoot = join(__dirname, '..');
const monorepoRoot = join(cliRoot, '..', '..');
const metafilePath = join(cliRoot, 'metadata.json');

// Parse CLI args
const args = process.argv.slice(2);
const shouldFail = args.includes('--fail');
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 100;

// Known duplicates that are intentional or can't be fixed easily
const IGNORED_DUPLICATES = [
  // Example: 'some-package'
];

function parseMetafile() {
  if (!existsSync(metafilePath)) {
    console.error('Error: metadata.json not found. Run build with metafile enabled first.');
    console.error('Run: pnpm build:check-dupes');
    process.exit(1);
  }
  return JSON.parse(readFileSync(metafilePath, 'utf8'));
}

function extractPackageInfo(filePath) {
  const match = filePath.match(/node_modules\/\.pnpm\/([^/]+)/);
  if (!match) return null;

  const pnpmName = match[1].split('_')[0];
  const atIndex = pnpmName.lastIndexOf('@');
  if (atIndex <= 0) return null;

  const name = pnpmName.slice(0, atIndex).replace(/\+/g, '/');
  const version = pnpmName.slice(atIndex + 1);

  return { name, version };
}

function extractPackageName(filePath) {
  const match = filePath.match(/node_modules\/\.pnpm\/([^/]+)/);
  if (!match) return null;
  const pnpmName = match[1].split('_')[0];
  const atIndex = pnpmName.lastIndexOf('@');
  if (atIndex <= 0) return null;
  return pnpmName.slice(0, atIndex).replace(/\+/g, '/');
}

function buildReverseGraph(metafile) {
  // Map: file -> list of files that import it
  const importedBy = new Map();

  for (const [filePath, info] of Object.entries(metafile.inputs)) {
    for (const imp of info.imports || []) {
      if (!importedBy.has(imp.path)) {
        importedBy.set(imp.path, []);
      }
      importedBy.get(imp.path).push(filePath);
    }
  }

  return importedBy;
}

function findImportChains(metafile, targetPackage, targetVersion) {
  const importedBy = buildReverseGraph(metafile);

  // Find all files from the target package@version
  const targetFiles = Object.keys(metafile.inputs).filter(f => {
    const pkg = extractPackageInfo(f);
    return pkg && pkg.name === targetPackage && pkg.version === targetVersion;
  });

  // BFS to find chains back to source files
  const chains = [];
  const visited = new Set();

  for (const startFile of targetFiles) {
    const queue = [[startFile]];

    while (queue.length > 0) {
      const chain = queue.shift();
      const current = chain[0];

      if (visited.has(current + ':' + chain.length)) continue;
      visited.add(current + ':' + chain.length);

      // If we reached a source file, record the chain
      if (current.startsWith('src/')) {
        chains.push(chain);
        continue;
      }

      // Get files that import current
      const importers = importedBy.get(current) || [];
      for (const importer of importers) {
        if (!chain.includes(importer)) {
          queue.push([importer, ...chain]);
        }
      }

      // Limit chain length to avoid infinite loops
      if (chain.length > 15) continue;
    }
  }

  return chains;
}

function summarizeChains(chains) {
  // Extract the package path from each chain and dedupe
  const packagePaths = new Map();

  for (const chain of chains) {
    // Convert file paths to package names
    const pkgChain = [];
    let lastPkg = null;

    for (const file of chain) {
      if (file.startsWith('src/')) {
        pkgChain.push('src/' + file.split('/')[1]);
      } else {
        const pkg = extractPackageName(file);
        if (pkg && pkg !== lastPkg) {
          pkgChain.push(pkg);
          lastPkg = pkg;
        }
      }
    }

    const key = pkgChain.join(' → ');
    if (!packagePaths.has(key)) {
      packagePaths.set(key, pkgChain);
    }
  }

  // Sort by length (shorter chains first)
  return Array.from(packagePaths.values()).sort((a, b) => a.length - b.length);
}

function findDuplicates(metafile) {
  const packages = new Map();

  for (const [filePath, info] of Object.entries(metafile.inputs)) {
    const pkg = extractPackageInfo(filePath);
    if (!pkg) continue;

    if (!packages.has(pkg.name)) {
      packages.set(pkg.name, new Map());
    }

    const versions = packages.get(pkg.name);
    versions.set(pkg.version, (versions.get(pkg.version) || 0) + info.bytes);
  }

  const duplicates = [];
  for (const [name, versions] of packages) {
    if (versions.size > 1 && !IGNORED_DUPLICATES.includes(name)) {
      const versionList = Array.from(versions.entries())
        .map(([v, bytes]) => ({ version: v, kb: Math.round(bytes / 1024) }))
        .sort((a, b) => compareVersions(b.version, a.version));

      const totalKb = versionList.reduce((sum, v) => sum + v.kb, 0);
      const savingsKb = totalKb - versionList[0].kb;

      duplicates.push({
        name,
        versions: versionList,
        latestVersion: versionList[0].version,
        totalKb,
        savingsKb,
      });
    }
  }

  return duplicates.sort((a, b) => b.savingsKb - a.savingsKb);
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function findPackageJsonFiles() {
  const results = [];
  const ignoreDirs = ['node_modules', 'dist', 'test', 'fixtures', '.git', '.turbo'];

  function walk(dir) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (ignoreDirs.includes(entry)) continue;

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (entry === 'package.json') {
            results.push(fullPath);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  walk(monorepoRoot);
  return results;
}

function findDependencyLocations(packageName, targetVersion) {
  const locations = [];
  const pkgFiles = findPackageJsonFiles();

  for (const pkgPath of pkgFiles) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const relativePath = relative(monorepoRoot, pkgPath);

      for (const depType of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        const deps = pkg[depType];
        if (!deps || !deps[packageName]) continue;

        const currentSpec = deps[packageName];
        if (currentSpec.startsWith('workspace:')) continue;

        const currentVersion = currentSpec.replace(/^[\^~>=<]+/, '');

        if (currentVersion !== targetVersion && compareVersions(currentVersion, targetVersion) < 0) {
          locations.push({
            file: relativePath,
            depType,
            currentSpec,
            currentVersion,
          });
        }
      }
    } catch {
      // Skip invalid package.json files
    }
  }

  return locations;
}

function formatReport(duplicates, metafile) {
  if (duplicates.length === 0) {
    return '✅ No duplicate dependencies found in bundle.\n';
  }

  const totalSavings = duplicates.reduce((sum, d) => sum + d.savingsKb, 0);

  let report = `\n⚠️  Found ${duplicates.length} duplicate dependencies (${totalSavings}KB potential savings)\n`;
  report += '═'.repeat(80) + '\n';

  for (const dup of duplicates) {
    report += `\n📦 ${dup.name} (save ${dup.savingsKb}KB)\n`;
    report += `   Bundled: ${dup.versions.map(v => `${v.version} (${v.kb}KB)`).join(', ')}\n`;
    report += `   Target: ${dup.latestVersion}\n`;

    // Find direct dependency locations
    const locations = findDependencyLocations(dup.name, dup.latestVersion);

    if (locations.length > 0) {
      report += `\n   Direct dependency updates:\n`;
      for (const loc of locations) {
        report += `   → ${loc.file}\n`;
        report += `     ${loc.depType}: "${dup.name}": "${loc.currentSpec}" → "^${dup.latestVersion}"\n`;
      }
    }

    // Find import chains for old versions
    const oldVersions = dup.versions.filter(v => v.version !== dup.latestVersion);
    for (const oldVer of oldVersions) {
      const chains = findImportChains(metafile, dup.name, oldVer.version);
      const summarized = summarizeChains(chains);

      if (summarized.length > 0) {
        report += `\n   Import chains for ${oldVer.version}:\n`;
        // Show up to 3 unique chains
        for (const chain of summarized.slice(0, 3)) {
          report += `   ${chain.join(' → ')}\n`;
        }
        if (summarized.length > 3) {
          report += `   ... and ${summarized.length - 3} more chains\n`;
        }
      }
    }
  }

  report += '\n' + '═'.repeat(80) + '\n';
  report += `\nAfter updating, run: pnpm install && pnpm --filter=vercel build:check-dupes\n`;

  return report;
}

// Main
const metafile = parseMetafile();
const duplicates = findDuplicates(metafile);
const report = formatReport(duplicates, metafile);

console.log(report);

const totalSavings = duplicates.reduce((sum, d) => sum + d.savingsKb, 0);

if (shouldFail && totalSavings > threshold) {
  console.error(`\n❌ Build check failed: duplicate dependencies exceed threshold (${totalSavings}KB > ${threshold}KB)`);
  console.error('Fix duplicates listed above or increase threshold with --threshold=N\n');
  process.exit(1);
}
