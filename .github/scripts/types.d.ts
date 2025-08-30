
export interface Command {
  name: string,
  script: string
}
export interface Params {
  command: string | Command[]
}