import { TestBed } from '@angular/core/testing';

import { MenuAccessService } from './menu-access.service';
import { TourDefinition, TourService } from './tour.service';

const TOUR: TourDefinition = {
  id: 'test-tour',
  label: 'Test',
  steps: [
    { target: '[data-tour="a"]', title: 'One', body: 'First' },
    { target: '[data-tour="b"]', title: 'Two', body: 'Second' },
  ],
};

/** Stands in for the real menu service so the storage key has a user to key on. */
class FakeMenuAccess {
  private id = 'alice';
  userId = () => this.id;
  setUser(next: string) {
    this.id = next;
  }
}

describe('TourService', () => {
  let service: TourService;
  let menu: FakeMenuAccess;

  beforeEach(() => {
    localStorage.clear();
    menu = new FakeMenuAccess();
    TestBed.configureTestingModule({
      providers: [TourService, { provide: MenuAccessService, useValue: menu }],
    });
    service = TestBed.inject(TourService);
  });

  it('walks forward and back through the steps', () => {
    service.start(TOUR);
    expect(service.activeStep()?.title).toBe('One');
    expect(service.isFirst()).toBe(true);

    service.next();
    expect(service.activeStep()?.title).toBe('Two');
    expect(service.isLast()).toBe(true);

    service.back();
    expect(service.activeStep()?.title).toBe('One');
  });

  it('completes when advancing past the last step', () => {
    service.start(TOUR);
    service.next();
    service.next();

    expect(service.isRunning()).toBe(false);
    expect(service.hasCompleted(TOUR.id)).toBe(true);
  });

  // The distinction that matters: closing a tour to deal with an interruption is not the
  // same as having learned the screen, so it must come back.
  it('dismiss does NOT record completion, so the tour returns next session', () => {
    service.start(TOUR);
    service.dismiss();

    expect(service.isRunning()).toBe(false);
    expect(service.hasCompleted(TOUR.id)).toBe(false);
  });

  // Switching a tab writes a query parameter, which is a navigation, which re-offers the
  // tour. Without a session-level dismissal the close button appeared not to work.
  it('dismiss holds for the rest of the session', () => {
    service.start(TOUR);
    service.dismiss();

    service.startIfUnseen(TOUR);
    expect(service.isRunning()).toBe(false);

    service.setOfferedTour(TOUR);
    expect(service.isRunning()).toBe(false);
  });

  it('an explicit replay overrides the session dismissal', () => {
    service.start(TOUR);
    service.dismiss();

    service.start(TOUR);
    expect(service.isRunning()).toBe(true);
  });

  it('"do not show again" records completion', () => {
    service.start(TOUR);
    service.dismissForever();

    expect(service.hasCompleted(TOUR.id)).toBe(true);
    service.startIfUnseen(TOUR);
    expect(service.isRunning()).toBe(false);
  });

  it('startIfUnseen does not interrupt a tour already open', () => {
    service.start(TOUR);
    service.next();
    const before = service.stepIndex();

    service.startIfUnseen(TOUR);
    expect(service.stepIndex()).toBe(before);
  });

  // A shared workstation is the case this guards: the second person to sit down has not
  // seen the tour, and a machine-wide flag would deny it to them.
  it('remembers completion per user, not per machine', () => {
    service.start(TOUR);
    service.finish();
    expect(service.hasCompleted(TOUR.id)).toBe(true);

    menu.setUser('bob');
    expect(service.hasCompleted(TOUR.id)).toBe(false);

    menu.setUser('alice');
    expect(service.hasCompleted(TOUR.id)).toBe(true);
  });

  it('reset clears the flag so it auto-starts again', () => {
    service.start(TOUR);
    service.finish();
    service.reset(TOUR.id);

    expect(service.hasCompleted(TOUR.id)).toBe(false);
  });

  it('ignores a tour with no steps rather than opening an empty overlay', () => {
    service.start({ id: 'empty', label: 'Empty', steps: [] });
    expect(service.isRunning()).toBe(false);
  });
});
