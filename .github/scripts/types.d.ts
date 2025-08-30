
export interface Command {
  name: string,
  script: string
}
export interface RunParams {
  command: string | Command[]
}

export interface Workflow<P> {
  (p: WorkflowParams<P>)
}
export interface WorkflowParams<P> {
  params: P,
  importScriptFromUrl<V extends Workflow<any>>(url: string): V,
  runGroup(name: string, callback: () => any | Promise<any>)
}