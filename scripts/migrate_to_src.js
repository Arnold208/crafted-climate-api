const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const DIRS = [
    'config',
    'database',
    'models', // Renamed from model
    'middleware',
    'utils',
    'modules',
    'modules/user',
    'modules/auth',
    'modules/telemetry',
    'modules/organization',
    'modules/device',
    'modules/subscription'
];

// Ensure dirs exist
if (!fs.existsSync(SRC)) fs.mkdirSync(SRC);
DIRS.forEach(d => {
    const p = path.join(SRC, d);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Helper to copy recursively
function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    const entries = fs.readdirSync(src, { withFileTypes: true });
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            let content = fs.readFileSync(srcPath, 'utf8');
            // FIX IMPORTS ON THE FLY
            content = fixImports(content, entry.name);
            fs.writeFileSync(destPath, content);
        }
    }
}

// Helper to fix imports in file content
function fixImports(content, filename) {
    // 1. model -> models
    content = content.replace(/require\(['"]\.\.\/model\//g, "require('../models/");
    content = content.replace(/require\(['"]\.\.\/\.\.\/model\//g, "require('../../models/");
    content = content.replace(/require\(['"]\.\.\/\.\.\/\.\.\/model\//g, "require('../../../models/");

    // 2. Fix config/utils/middleware paths if they were relative
    // This is tricky without strict AST, but we can catch common patterns.
    // Assuming we are generally moving things 1 level deeper (root -> src/...) 
    // or same depth relative to each other if both moved.

    // If a file is in src/services (depth 2) and needs config (src/config - depth 2)
    // Old: root/services/foo.js -> ../config
    // New: src/services/foo.js -> ../config (Same!)

    // If a file is in root/routes/user/user.js (depth 2) -> ../../config
    // New: src/modules/user/user.controller.js (depth 3) -> ../../config (Same!)

    return content;
}

console.log('Starting Migration...');

// 1. Core
copyDir(path.join(ROOT, 'config'), path.join(SRC, 'config'));
copyDir(path.join(ROOT, 'utils'), path.join(SRC, 'utils'));
copyDir(path.join(ROOT, 'middleware'), path.join(SRC, 'middleware'));
copyDir(path.join(ROOT, 'model'), path.join(SRC, 'models')); // Rename

// 2. Services & Controllers (From root to src/modules)
// User
const USER_MOD = path.join(SRC, 'modules/user');
if (fs.existsSync(path.join(ROOT, 'controllers/userController.js'))) {
    fs.copyFileSync(path.join(ROOT, 'controllers/userController.js'), path.join(USER_MOD, 'user.controller.js'));
}
if (fs.existsSync(path.join(ROOT, 'services/userService.js'))) {
    fs.copyFileSync(path.join(ROOT, 'services/userService.js'), path.join(USER_MOD, 'user.service.js'));
}

// Telemetry
const TELEM_MOD = path.join(SRC, 'modules/telemetry');
if (fs.existsSync(path.join(ROOT, 'controllers/telemetryController.js'))) {
    fs.copyFileSync(path.join(ROOT, 'controllers/telemetryController.js'), path.join(TELEM_MOD, 'telemetry.controller.js'));
}
if (fs.existsSync(path.join(ROOT, 'services/telemetryService.js'))) {
    fs.copyFileSync(path.join(ROOT, 'services/telemetryService.js'), path.join(TELEM_MOD, 'telemetry.service.js'));
}

console.log('Migration Script Complete.');
