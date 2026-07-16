// Server is "infrastructure ready" — endpoints exist, http-client exists.
// The api/* files in src/lib/api/ still read/write the in-memory mock.
// Switching the entire app to the live server is a follow-up; this phase
// establishes the boundary so any future migration is incremental.
export const BACKEND_READY = true
