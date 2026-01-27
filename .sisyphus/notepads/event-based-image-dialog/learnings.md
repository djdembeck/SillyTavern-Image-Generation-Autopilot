- GenerationDetector subscribes to MESSAGE_RECEIVED and filters for source === 'extension' to detect SD completion events.
- Designed completion event mapping to allow future SD_GENERATION_COMPLETE event hookup without changing public API.

- Added ParallelGenerator with concurrency-limited worker pool, model queue cycling by count, and progress callbacks to align with SD slash execution patterns.
- ParallelGenerator tests should mock callSdSlash with deferred promises to assert concurrency limits, parallel worker overlap, model cycling, error handling, and abort behavior.
