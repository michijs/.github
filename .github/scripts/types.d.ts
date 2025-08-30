
export interface Command {
  name: string,
  script: string
}

export interface RunParams {
  command: string | Command[]
}

export interface NpmRepositoryInfo {
  type?: string;
  url?: string;
  directory?: string;
}

export interface MichijsDependabotParams {
  githubRepository: string;
  updatedPackages: [string, string];
  ref: string;
  oldPackageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    packageManager?: string
  }
}

export interface Workflow<P> {
  (p: WorkflowParams<P>)
}
export interface WorkflowParams<P> {
  params: P,
  importScriptFromUrl<P>(url: string): Workflow<P>,
  runGroup<T>(name: string, callback: () => T): T
}