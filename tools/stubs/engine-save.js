// Shim: GameKit.save, minus the persistence.
//
// A compo entry has no checkpoints to restore, but story-progress.ts still
// routes in-run memory (jackTrust, liliResolve, factMask) through this object,
// so the shape has to survive even though nothing is written. `data: null`
// makes readStorySave take its no-save-found path on boot.
Object.assign(GameKit, {
  createSave: function () {
    return { ready: Promise.resolve(), data: null, put: function () {}, flush: function () {} };
  },
});
