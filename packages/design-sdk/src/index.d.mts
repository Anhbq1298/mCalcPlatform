export interface Quantity { value: number; unit: string }
export interface DesignDoc<I = Record<string, unknown>> {
  id: string; tool: string; toolVersion: string; schema: number; inputs: I;
  meta: { name: string; mark: string; label: string; notes: string };
  pending?: true;
  report?: Record<string, unknown>; reportHash?: string;
}
export interface DesignTool<I, R = Record<string, unknown>> {
  id: string; schema: number;
  defaults(): I;
  migrate(raw: unknown, from: number): I;
  validate(inputs: I): string[];
  outputs(inputs: I): Record<string, Quantity> | Promise<Record<string, Quantity>>;
  report(inputs: I): R | Promise<R>;
}
export interface ToolManifest {
  id: string; name: string; version: string; schema: number; labels: string[]; folder: string;
  entry: string; description: string;
  title?: string; code?: string; keywords?: string[]; localDraft?: string;
}
export interface ProjectDoc {
  id: string; name: string; settings: Record<string, unknown>;
  folders: { id: string; name: string; parentId?: string; designs: string[] }[];
}
export interface PackageContents { designs: DesignDoc[]; project?: ProjectDoc }
export interface WorkspaceStore {
  getDesign(id: string): Promise<DesignDoc | undefined>;
  listDesigns(): Promise<DesignDoc[]>;
  saveDesign(design: DesignDoc): Promise<void>;
  updateDesign(id: string, transform: (design: DesignDoc) => DesignDoc): Promise<void>;
  getProject(id: string): Promise<ProjectDoc | undefined>;
  listProjects(): Promise<ProjectDoc[]>;
  saveProject(project: ProjectDoc): Promise<void>;
  updateProject(id: string, transform: (project: ProjectDoc) => ProjectDoc): Promise<void>;
  addProjectDesign(projectId: string, folderId: string, design: DesignDoc): Promise<void>;
  moveDesign(projectId: string, designId: string, folderId: string): Promise<void>;
  importPackage(contents: PackageContents): Promise<IDBValidKey | undefined>;
}
export interface ToolPageAdapter {
  snapshot(): object | Promise<object>;
  restore(inputs: Record<string, unknown>): void | Promise<void>;
  reset?(): void | Promise<void>;
  report?(): Record<string, unknown> | Promise<Record<string, unknown>>;
  openNativeReport?(): void;
}
export declare function createDesign(tool: ToolManifest, name: string, inputs: Record<string, unknown>): DesignDoc;
export declare function createProject(name: string): ProjectDoc;
export declare function duplicateDesign(doc: DesignDoc): DesignDoc;
export declare function parseDesign(value: unknown): DesignDoc;
export declare function validateProject(value: unknown): ProjectDoc;
export declare const projectFolders: [string, string][];
export declare function createStore(factory?: IDBFactory): WorkspaceStore;
export declare function exportPackage(contents: PackageContents): Promise<Blob>;
export declare function importPackage(file: Blob): Promise<PackageContents>;
export declare function mountToolShell(options: {
  tool: ToolManifest; getAdapter(): ToolPageAdapter | undefined; home: URL; reportUrl: URL; reportOwner?: DesignDoc;
}): void;
