import { Injectable, computed, inject, signal } from '@angular/core';

import { MenuAccessService } from './menu-access.service';

export interface TourStep {
  /**
   * CSS selector for the element to spotlight. Target elements carry a `data-tour`
   * attribute rather than being found by class: a class is a styling decision and will be
   * renamed by someone who has no idea a tour depends on it, whereas `data-tour` announces
   * that something points at this element.
   */
  target?: string;
  title: string;
  body: string;
}

export interface TourDefinition {
  id: string;
  /** Shown on the replay button. */
  label: string;
  steps: TourStep[];
}

const STORAGE_PREFIX = 'to-tour';

/**
 * First-run walkthroughs.
 *
 * Ownership transfers is a five-step flow across three panels where each step only reveals
 * the next — nothing about the screen tells a first-time user that picking a period is what
 * makes the owner list appear. Documentation would not be read; a tour that points at the
 * next control is.
 *
 * **Completion is remembered per user, per tour.** Keying on the user id matters on a
 * shared workstation: the second person to sit down at a machine has not seen the tour,
 * and a machine-wide flag would deny it to them.
 *
 * A tour never starts twice on its own, and can always be replayed deliberately from the
 * page header — someone who dismissed it in a hurry should not have to clear storage.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly menuAccess = inject(MenuAccessService);

  private readonly definition = signal<TourDefinition | null>(null);
  private readonly index = signal(0);

  readonly activeTour = this.definition.asReadonly();
  readonly stepIndex = this.index.asReadonly();

  readonly activeStep = computed<TourStep | null>(() => {
    const tour = this.definition();
    if (!tour) {
      return null;
    }
    return tour.steps[this.index()] ?? null;
  });

  readonly totalSteps = computed(() => this.definition()?.steps.length ?? 0);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() >= this.totalSteps() - 1);
  readonly isRunning = computed(() => this.definition() !== null);

  /** Starts regardless of whether it was completed before. The replay path. */
  start(tour: TourDefinition): void {
    if (tour.steps.length === 0) {
      return;
    }
    this.index.set(0);
    this.definition.set(tour);
  }

  /**
   * Starts only if this user has never finished it.
   *
   * Called from a screen's constructor, so it must be cheap and must not fight a tour that
   * is already open — switching tabs on a tabbed screen should not restart the walkthrough
   * underneath the user.
   */
  startIfUnseen(tour: TourDefinition): void {
    if (this.isRunning() || this.hasCompleted(tour.id)) {
      return;
    }
    this.start(tour);
  }

  next(): void {
    if (this.isLast()) {
      this.finish();
      return;
    }
    this.index.update((value) => value + 1);
  }

  back(): void {
    if (this.index() > 0) {
      this.index.update((value) => value - 1);
    }
  }

  /** Reaching the end counts as having seen it. */
  finish(): void {
    const tour = this.definition();
    if (tour) {
      this.markCompleted(tour.id);
    }
    this.definition.set(null);
  }

  /**
   * Closes without recording completion, so it opens again next time.
   *
   * Deliberately distinct from `finish()`: someone who closes a tour to deal with an
   * interruption has not learned the screen, and silently never showing it again would be
   * the wrong inference from a single dismissal.
   */
  dismiss(): void {
    this.definition.set(null);
  }

  /** "Do not show again" — dismiss *and* record it. */
  dismissForever(): void {
    this.finish();
  }

  hasCompleted(tourId: string): boolean {
    try {
      return localStorage.getItem(this.storageKey(tourId)) === 'done';
    } catch {
      // Private browsing or a locked-down profile. Losing the flag means the tour shows
      // again, which is a far better failure than the screen refusing to load.
      return false;
    }
  }

  /** Clears the flag so the tour auto-starts again. Used by the replay control. */
  reset(tourId: string): void {
    try {
      localStorage.removeItem(this.storageKey(tourId));
    } catch {
      // Nothing to do — see hasCompleted.
    }
  }

  private markCompleted(tourId: string): void {
    try {
      localStorage.setItem(this.storageKey(tourId), 'done');
    } catch {
      // Same reasoning as hasCompleted: never let storage break the screen.
    }
  }

  private storageKey(tourId: string): string {
    // Per user, not per machine — see the class comment.
    return `${STORAGE_PREFIX}:${tourId}:${this.menuAccess.userId() || 'anonymous'}`;
  }
}
