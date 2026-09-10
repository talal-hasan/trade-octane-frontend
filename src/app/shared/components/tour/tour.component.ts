import { AfterViewInit, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { fromEvent } from 'rxjs';

import { TourService } from '../../../core/services/tour.service';
import { ICON_REGISTRY } from '../../icon-registry';

/** Where the spotlight sits, in viewport coordinates. */
interface Spotlight {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 6;
const CARD_WIDTH = 340;
const CARD_GAP = 12;

/**
 * The tour overlay: a spotlight on the current step's target and a card explaining it.
 *
 * Mounted once in the shell, so any screen can start a tour without owning any chrome.
 *
 * **The spotlight is a single element with an enormous outward box-shadow** rather than
 * four dimming panels around a hole. One element cannot develop hairline seams between the
 * panels when the target lands on a fractional pixel, and it animates as one thing when the
 * step changes.
 *
 * A step whose target is missing still renders — centred, with no spotlight — because the
 * later steps of a workflow tour point at controls that only exist once earlier steps have
 * been done. Guidance that vanishes exactly when the user has not yet done the thing would
 * be useless precisely when it is needed.
 */
@Component({
  selector: 'to-tour',
  standalone: true,
  imports: [TablerIconComponent, ButtonModule],
  templateUrl: './tour.component.html',
  styleUrl: './tour.component.scss',
})
export class TourComponent implements AfterViewInit {
  protected readonly tour = inject(TourService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly spotlight = signal<Spotlight | null>(null);

  /**
   * The step we have already scrolled into view.
   *
   * Scrolling belongs to a *step change*, never to a measurement. `measure()` runs on every
   * scroll event, and a smooth `scrollIntoView` emits a stream of them — so scrolling from
   * inside `measure()` re-entered itself mid-animation and pegged the renderer until the
   * tab stopped responding. Scroll once, then only ever read.
   */
  private scrolledForStep = -1;

  /** Coalesces bursts of scroll/resize events into one measurement per frame. */
  private measureHandle: number | null = null;

  constructor() {
    // Re-measure whenever the step changes. Reading both signals is what makes the effect
    // track them.
    effect(() => {
      const step = this.tour.activeStep();
      const index = this.tour.stepIndex();
      if (!step) {
        this.spotlight.set(null);
        this.scrolledForStep = -1;
        return;
      }
      // Defer past the change that revealed the target.
      queueMicrotask(() => {
        this.ensureVisible(index);
        this.measure();
      });
    });

    fromEvent(window, 'resize')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.scheduleMeasure());

    // Capture phase: the page scrolls inside `.to-shell__content`, not on window, so a
    // bubbling listener on window would never fire.
    fromEvent(this.document, 'scroll', { capture: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.scheduleMeasure());

    fromEvent<KeyboardEvent>(this.document, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (!this.tour.isRunning()) {
          return;
        }
        if (event.key === 'Escape') {
          this.tour.dismiss();
        } else if (event.key === 'ArrowRight') {
          this.tour.next();
        } else if (event.key === 'ArrowLeft') {
          this.tour.back();
        }
      });
  }

  ngAfterViewInit(): void {
    this.measure();
  }

  /** One measurement per animation frame, however many events arrive. */
  private scheduleMeasure(): void {
    if (this.measureHandle !== null) {
      return;
    }
    this.measureHandle = requestAnimationFrame(() => {
      this.measureHandle = null;
      this.measure();
    });
  }

  /**
   * Brings the step's target on screen — **once per step**.
   *
   * Never call this from `measure()`: see the note on `scrolledForStep`.
   */
  private ensureVisible(index: number): void {
    if (this.scrolledForStep === index) {
      return;
    }
    this.scrolledForStep = index;

    const target = this.tour.activeStep()?.target;
    const element = target ? this.document.querySelector(target) : null;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /** Pure read. Never scrolls, never writes to the DOM. */
  private measure(): void {
    const step = this.tour.activeStep();
    if (!step?.target) {
      this.spotlight.set(null);
      return;
    }

    const element = this.document.querySelector(step.target);
    if (!element) {
      this.spotlight.set(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    this.spotlight.set({
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    });
  }

  /**
   * Card position: below the spotlight when there is room, above when there is not, and
   * centred when there is no target at all. Clamped to the viewport so it can never be
   * pushed half off-screen by a target near an edge.
   */
  protected readonly cardStyle = computed<Record<string, string>>(() => {
    const light = this.spotlight();
    if (!light) {
      const centred: Record<string, string> = {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${CARD_WIDTH}px`,
      };
      return centred;
    }

    const spaceBelow = window.innerHeight - (light.top + light.height);
    const below = spaceBelow > 220;
    const top = below ? light.top + light.height + CARD_GAP : Math.max(CARD_GAP, light.top - 220);

    const rawLeft = light.left + light.width / 2 - CARD_WIDTH / 2;
    const left = Math.min(
      Math.max(CARD_GAP, rawLeft),
      Math.max(CARD_GAP, window.innerWidth - CARD_WIDTH - CARD_GAP),
    );

    const placed: Record<string, string> = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${CARD_WIDTH}px`,
    };
    return placed;
  });

  protected readonly spotlightStyle = computed<Record<string, string>>(() => {
    const light = this.spotlight();
    if (!light) {
      const hidden: Record<string, string> = { display: 'none' };
      return hidden;
    }
    const placed: Record<string, string> = {
      top: `${light.top}px`,
      left: `${light.left}px`,
      width: `${light.width}px`,
      height: `${light.height}px`,
    };
    return placed;
  });

  protected readonly progressLabel = computed(
    () => `Step ${this.tour.stepIndex() + 1} of ${this.tour.totalSteps()}`,
  );
}
