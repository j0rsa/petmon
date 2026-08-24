import type { Decorator, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

/** Smallest phone canvas we must support. */
export const NARROW_VIEWPORT = { width: 360, height: 700 } as const;

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
