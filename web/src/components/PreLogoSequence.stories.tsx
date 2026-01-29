import type { Meta, StoryObj } from '@storybook/react';
import PreLogoSequence from './PreLogoSequence';

const meta: Meta<typeof PreLogoSequence> = {
  title: 'Intro/PreLogoSequence',
  component: PreLogoSequence,
  args: {
    onComplete: () => { /* no-op for story */ }
  }
};

export default meta;

type Story = StoryObj<typeof PreLogoSequence>;

export const Default: Story = {
  args: {}
};
