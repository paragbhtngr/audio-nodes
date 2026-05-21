declare module '*.css' {}

// Electron exposes the absolute file path on File objects in the renderer
interface File {
  readonly path: string;
}
