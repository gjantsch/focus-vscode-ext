"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FocusItem = void 0;
exports.iconForStatus = iconForStatus;
exports.labelForChange = labelForChange;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const STATUS_ICONS = {
    'M': 'git-commit',
    'A': 'diff-added',
    'D': 'diff-removed',
    'R': 'diff-renamed',
    '?': 'question',
    'C': 'copy',
    'U': 'warning',
};
class FocusItem extends vscode.TreeItem {
    constructor(change, label, collapsibleState, dirNode) {
        super(label, collapsibleState);
        this.change = change;
        this.dirNode = dirNode;
        if (change) {
            this.resourceUri = vscode.Uri.file(change.absolutePath);
            this.command = {
                command: 'focus.openFile',
                title: 'Open File',
                arguments: [this.resourceUri, change.status],
            };
            this.iconPath = iconForStatus(change.status);
            this.description = change.category;
            this.tooltip = `${change.relativePath} [${change.status}] — ${change.category}`;
            this.contextValue = `focusFile_${change.status}`;
        }
        else if (dirNode) {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'focusDir';
        }
    }
}
exports.FocusItem = FocusItem;
function iconForStatus(status) {
    return new vscode.ThemeIcon(STATUS_ICONS[status] ?? 'file');
}
function labelForChange(change) {
    return path.basename(change.relativePath);
}
//# sourceMappingURL=focusItem.js.map