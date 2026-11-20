// webpack's require.context, used by the new UI's page registry (pages.ts).
interface WebpackLazyContext {
  keys(): string[]
  (id: string): Promise<unknown>
}

interface NodeRequire {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp, mode: "lazy"): WebpackLazyContext
}
