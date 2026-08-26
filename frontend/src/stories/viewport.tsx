import { useLayoutEffect } from 'react';
import type { Decorator, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

/** Smallest phone canvas we must support. */
export const NARROW_VIEWPORT = { width: 360, height: 700 } as const;

/**
 * Strips a notched phone reserves for the clock / camera hole and the home
 * indicator — roughly an iPhone 14 in portrait.
 */
export const SIMULATED_DEVICE_INSETS = { top: 47, bottom: 34 } as const;

/**
 * Pretend the story runs on a notched phone.
 *
 * `env(safe-area-inset-*)` is always 0 in a desktop browser, so the insets go
 * on the document root, which is where `:root` and `:root:has(.demo-banner)`
 * read them from. Without this, notch regressions are invisible in Storybook.
 */
export function withDeviceInsets(insets: { top?: number; bottom?: number } = {}): Decorator {
  const top = insets.top ?? SIMULATED_DEVICE_INSETS.top;
  const bottom = insets.bottom ?? SIMULATED_DEVICE_INSETS.bottom;
  return function DeviceInsetsDecorator(Story) {
    useLayoutEffect(() => {
      const root = document.documentElement;
      root.style.setProperty('--device-top', `${top}px`);
      root.style.setProperty('--device-bottom', `${bottom}px`);
      return () => {
        root.style.removeProperty('--device-top');
        root.style.removeProperty('--device-bottom');
      };
    }, []);
    return <Story />;
  };
}

/** Nothing readable may sit in the strip the OS draws the status bar over. */
export function assertTextClearsTopInset(
  element: HTMLElement | null,
  label: string,
  insetTop: number = SIMULATED_DEVICE_INSETS.top,
) {
  expect(element, `${label} should be rendered`).toBeTruthy();
  const contents = document.createRange();
  contents.selectNodeContents(element!);
  const textTop = Math.round(contents.getBoundingClientRect().top);
  expect(
    textTop,
    `${label} text starts at ${textTop}px, inside the ${insetTop}px status bar / camera strip`,
  ).toBeGreaterThanOrEqual(insetTop);
}

/**
 * The mobile bottom nav is glued to the bottom edge, and its tappable items
 * stay above the home indicator.
 */
export function assertBottomNavPinned(
  canvasElement: HTMLElement,
  insetBottom: number = SIMULATED_DEVICE_INSETS.bottom,
) {
  const nav = canvasElement.querySelector<HTMLElement>('.bottom-nav');
  expect(nav, 'bottom nav should be rendered').toBeTruthy();
  expect(getComputedStyle(nav!).display, 'bottom nav should be visible at this width').not.toBe('none');
  expect(getComputedStyle(nav!).position).toBe('fixed');
  const navBottom = Math.round(nav!.getBoundingClientRect().bottom);
  expect(navBottom, `bottom nav should touch the viewport bottom (${window.innerHeight}px)`)
    .toBeGreaterThanOrEqual(window.innerHeight - 1);
  const item = nav!.querySelector<HTMLElement>('.bottom-nav-item');
  expect(item, 'bottom nav items should be rendered').toBeTruthy();
  expect(
    Math.round(item!.getBoundingClientRect().bottom),
    'bottom nav items should stay above the home indicator',
  ).toBeLessThanOrEqual(window.innerHeight - insetBottom + 1);
}

/**
 * The shell spans exactly one viewport, so a banner cannot make a page that
 * fits scroll — the regression that left the bottom nav floating over a gap.
 */
export function assertShellSpansOneViewport(canvasElement: HTMLElement) {
  const shell = canvasElement.querySelector<HTMLElement>('.app-shell');
  expect(shell, 'app shell should be rendered').toBeTruthy();
  const box = shell!.getBoundingClientRect();
  expect(Math.round(box.top), 'shell should start at the top edge').toBeLessThanOrEqual(1);
  expect(
    Math.round(box.bottom),
    `shell (${Math.round(box.height)}px) should not overflow the ${window.innerHeight}px viewport`,
  ).toBeLessThanOrEqual(window.innerHeight + 1);
}

export const PWA_NARROW_VIEWPORT = {
  name: 'PWA Narrow (360×700)',
  styles: {
    width: `${NARROW_VIEWPORT.width}px`,
    height: `${NARROW_VIEWPORT.height}px`,
  },
  type: 'mobile' as const,
};

export const withNarrowFrame: Decorator = (Story) => (
  <div
    data-testid="narrow-frame"
    style={{
      width: NARROW_VIEWPORT.width,
      maxWidth: NARROW_VIEWPORT.width,
      minHeight: NARROW_VIEWPORT.height,
      boxSizing: 'border-box',
    }}
  >
    <Story />
  </div>
);

export function assertFitsNarrowViewport(canvasElement: HTMLElement) {
  const frame =
    canvasElement.closest('[data-testid="narrow-frame"]')
    ?? canvasElement.querySelector('[data-testid="narrow-frame"]')
    ?? canvasElement;
  expect(
    frame.scrollWidth,
    `UI overflows ${NARROW_VIEWPORT.width}px horizontally (${frame.scrollWidth}px)`,
  ).toBeLessThanOrEqual(frame.clientWidth + 1);
}

function isNarrowCanvas(canvasElement: HTMLElement): boolean {
  return Boolean(
    canvasElement.closest('[data-testid="narrow-frame"]')
    ?? canvasElement.querySelector('[data-testid="narrow-frame"]'),
  );
}

/** Desktop: action sits to the right of the heading on the header row. Narrow stories skip this. */
export function assertHeaderActionOnDesktop(
  canvasElement: HTMLElement,
  headingName: string,
  actionName: string,
) {
  if (isNarrowCanvas(canvasElement)) return;
  const heading = Array.from(canvasElement.querySelectorAll('h4'))
    .find((node) => node.textContent === headingName);
  const action = canvasElement.querySelector<HTMLElement>(`[aria-label="${actionName}"]`);
  expect(heading, `heading ${headingName}`).toBeTruthy();
  expect(action, `action ${actionName}`).toBeTruthy();
  const headingBox = heading!.getBoundingClientRect();
  const actionBox = action!.getBoundingClientRect();
  expect(
    actionBox.left,
    `${actionName} should sit to the right of ${headingName}`,
  ).toBeGreaterThan(headingBox.right);
  expect(
    actionBox.top,
    `${actionName} should share the header row with ${headingName}`,
  ).toBeLessThan(headingBox.bottom + 12);
}

/** The action is flush with the card's right edge, not trailing the title. */
function assertActionAtCardEdge(group: HTMLElement, actionName: string, cardSelector: string) {
  const card = group.closest<HTMLElement>(cardSelector);
  expect(card, `enclosing ${cardSelector}`).toBeTruthy();
  const inset = parseFloat(getComputedStyle(card!).paddingRight) || 0;
  const cardInnerRight = card!.getBoundingClientRect().right - inset;
  expect(
    Math.round(cardInnerRight - group.getBoundingClientRect().right),
    `${actionName} should end at the card's right edge`,
  ).toBeLessThanOrEqual(2);
}

/**
 * A card action belongs on the header row: at the card's right edge on desktop,
 * and wrapped onto its own line below the title once the header stacks.
 *
 * Unlike {@link assertHeaderActionOnDesktop} this asserts both layouts, so the
 * narrow twin covers the wrap instead of skipping.
 */
export function assertHeaderActionPlacement(
  canvasElement: HTMLElement,
  headingName: string,
  actionName: string,
  cardSelector = '.panel',
) {
  const heading = Array.from(canvasElement.querySelectorAll('h2, h3, h4, h5'))
    .find((node) => node.textContent === headingName);
  const action = canvasElement.querySelector<HTMLElement>(`[aria-label="${actionName}"]`);
  expect(heading, `heading ${headingName}`).toBeTruthy();
  expect(action, `action ${actionName}`).toBeTruthy();
  const headingBox = heading!.getBoundingClientRect();
  // Actions usually sit in a group; measure that, since it is what wraps and
  // what lines up with the card edge. A lone action is its own group.
  const parent = action!.parentElement;
  const group = parent && !parent.contains(heading!) ? parent : action!;
  const groupBox = group.getBoundingClientRect();

  if (groupBox.top >= headingBox.bottom) {
    // Stacked: the group wrapped below the title, which is the narrow layout.
    expect(
      Math.round(groupBox.left),
      `${actionName} should align to the start of the row when it wraps below ${headingName}`,
    ).toBeLessThanOrEqual(Math.round(headingBox.left) + 1);
    return;
  }

  expect(
    groupBox.left,
    `${actionName} should sit to the right of ${headingName}, not beside its text`,
  ).toBeGreaterThan(headingBox.right);
  assertActionAtCardEdge(group, actionName, cardSelector);
}

function decoratorList<TArgs>(story: StoryObj<TArgs>): Decorator[] {
  const value = story.decorators;
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]) as Decorator[];
}

/** Same interaction coverage as `story`, constrained to 360×700. */
export function asNarrowStory<TArgs>(story: StoryObj<TArgs>): StoryObj<TArgs> {
  const play = story.play;
  return {
    ...story,
    parameters: {
      ...story.parameters,
      viewport: {
        ...story.parameters?.viewport,
        defaultViewport: 'pwaNarrow',
      },
    },
    decorators: [...decoratorList(story), withNarrowFrame],
    play: async (context: { canvasElement: HTMLElement }) => {
      if (play) await (play as (ctx: { canvasElement: HTMLElement }) => unknown)(context);
      assertFitsNarrowViewport(context.canvasElement);
    },
  };
}
