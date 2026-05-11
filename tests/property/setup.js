import * as fc from "fast-check";

// Configure fast-check global settings: minimum 100 iterations per property test
fc.configureGlobal({
  numRuns: 100,
});
