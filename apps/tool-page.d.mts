import type { ToolPageAdapter } from '../packages/design-sdk/src/index.mjs';
export function registerPage(id: string, adapter: ToolPageAdapter): void;
export function resolveReport(start: (finish: (report: unknown) => void) => void, timeout?: number): Promise<Record<string, unknown>>;
