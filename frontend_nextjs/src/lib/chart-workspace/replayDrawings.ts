import type { Drawing, DrawingManager } from 'lightweight-charts-drawing';

/** Replay visibility is transient. Never replace a saved user visibility flag with the replay mask. */
export class ReplayDrawingVisibility {
  private hidden = new Map<string, boolean | undefined>();
  clear() { this.hidden.clear(); }
  sync(manager: DrawingManager, until: number) {
    const ids = new Set(manager.drawings().map(d => d.id));
    for (const id of this.hidden.keys()) if (!ids.has(id)) this.hidden.delete(id);
    for (const d of manager.drawings()) {
      const future = d.points.some(p => typeof p.time === 'number' && p.time > until);
      if (future) {
        if (!this.hidden.has(d.id)) this.hidden.set(d.id, d.hidden);
        if (!d.hidden) manager.setHidden(d.id, true);
      } else if (this.hidden.has(d.id)) {
        manager.setHidden(d.id, this.hidden.get(d.id) ?? false);
        this.hidden.delete(d.id);
      }
    }
  }
  snapshot(manager: DrawingManager): Drawing[] {
    return manager.drawings().map(d => this.hidden.has(d.id) ? { ...d, hidden: this.hidden.get(d.id) } : d);
  }
}
