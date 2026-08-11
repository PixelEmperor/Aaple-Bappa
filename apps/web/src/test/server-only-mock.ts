// `server-only` throws unconditionally unless the bundler applies Next.js's
// "react-server" condition, which Vitest doesn't. Aliased in here so tests
// that transitively import server-only modules (see vitest.config.mts)
// don't fail on that guard alone — Next's own build is still what enforces
// the real client/server boundary.
export {}
