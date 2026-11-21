import type { DesignDoc, ToolPageAdapter } from '../packages/design-sdk/src/index.mjs';
export function registerPage(id: string, adapter: ToolPageAdapter, reportOwner?: DesignDoc): void;
export function resolveReport(start: (finish: (report: unknown) => void) => void, timeout?: number): Promise<Record<string, unknown>>;
