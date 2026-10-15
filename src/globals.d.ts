// Build-time constants injected by `define` in vite.config.ts.

/** Version from package.json (Semantic Versioning). */
declare const __APP_VERSION__: string;
/** SemVer build metadata: short commit SHA, `.dirty` when uncommitted changes were built; may be empty. */
declare const __APP_BUILD__: string;
/** When this build was made (ISO 8601). */
declare const __APP_BUILD_DATE__: string;
