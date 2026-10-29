import { resolveReferencePaneWidth, shouldDismissReferencePane } from '../paneGeometry';

describe('reference pane geometry', () => {
  it('leaves a strip of the conversation visible', () => {
    expect(resolveReferencePaneWidth(390)).toBe(335);
    expect(resolveReferencePaneWidth(1024)).toBe(560);
  });

  it('clamps narrow hosts', () => {
    expect(resolveReferencePaneWidth(60)).toBe(12);
    expect(resolveReferencePaneWidth(0)).toBe(0);
  });

  it('dismisses past a quarter of the pane or a decisive flick', () => {
    expect(shouldDismissReferencePane({ distance: 100, velocity: 0, width: 335 })).toBe(true);
    expect(shouldDismissReferencePane({ distance: 20, velocity: 0, width: 335 })).toBe(false);
    expect(shouldDismissReferencePane({ distance: 30, velocity: 900, width: 335 })).toBe(true);
  });
});
